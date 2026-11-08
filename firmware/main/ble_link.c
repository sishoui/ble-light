/* BLE 链路：NimBLE GATT server、广播、RX 分片喂入、TX 通知。 */
#include "ble_link.h"

#include <string.h>

#include "chunk_reasm.h"
#include "esp_log.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "protocol_gen.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

static const char *TAG = "ble_link";

/* 生成器给的 UUID 是 128 位字符串，这里按原样用。 */
static const ble_uuid128_t g_svc_uuid =
    BLE_UUID128_INIT(0x01, 0x00, 0x00, 0x00, 0x3c, 0x9a, 0x1e, 0x4b,
                     0x00, 0x6e, 0x65, 0x6c, 0x75, 0x6d, 0x6c, 0x6c);
static const ble_uuid128_t g_rx_uuid =
    BLE_UUID128_INIT(0x02, 0x00, 0x00, 0x00, 0x3c, 0x9a, 0x1e, 0x4b,
                     0x00, 0x6e, 0x65, 0x6c, 0x75, 0x6d, 0x6c, 0x6c);
static const ble_uuid128_t g_tx_uuid =
    BLE_UUID128_INIT(0x03, 0x00, 0x00, 0x00, 0x3c, 0x9a, 0x1e, 0x4b,
                     0x00, 0x6e, 0x65, 0x6c, 0x75, 0x6d, 0x6c, 0x6c);
static const ble_uuid128_t g_state_uuid =
    BLE_UUID128_INIT(0x04, 0x00, 0x00, 0x00, 0x3c, 0x9a, 0x1e, 0x4b,
                     0x00, 0x6e, 0x65, 0x6c, 0x75, 0x6d, 0x6c, 0x6c);

static lumen_reasm_t s_reasm;
static lumen_frame_cb_t s_on_frame;
/** 读 State 特征时回调：把当前 32 字节状态填进 buf。 */
static lumen_state_cb_t s_on_state_read;
static uint16_t s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t s_tx_handle;
static uint16_t s_mtu = 23;

static int gatt_rx_access(uint16_t conn, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg);
static int gatt_tx_access(uint16_t conn, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg);
static int gatt_state_access(uint16_t conn, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg);

static const struct ble_gatt_svc_def g_services[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &g_svc_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[]) {
            {
                .uuid = &g_rx_uuid.u,
                .access_cb = gatt_rx_access,
                .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP,
            },
            {
                .uuid = &g_tx_uuid.u,
                .access_cb = gatt_tx_access,
                .flags = BLE_GATT_CHR_F_NOTIFY,
                .val_handle = &s_tx_handle,
            },
            {
                .uuid = &g_state_uuid.u,
                .access_cb = gatt_state_access,
                .flags = BLE_GATT_CHR_F_READ,
            },
            { 0 },
        },
    },
    { 0 },
};

static int gatt_rx_access(uint16_t conn, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg) {
    (void)conn;
    (void)attr;
    (void)arg;
    /* 一次写 = 一个分片。重组满一帧就交给上层。 */
    if (ctxt->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
        const uint16_t len = OS_MBUF_PKTLEN(ctxt->om);
        uint8_t buf[PROTO_MAX_FRAME + 1];
        uint16_t copied = 0;
        if (len > sizeof(buf)) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        ble_hs_mbuf_to_flat(ctxt->om, buf, sizeof(buf), &copied);
        if (lumen_reasm_feed(&s_reasm, buf, copied, (uint32_t)(esp_log_timestamp()))) {
            if (s_on_frame != NULL) s_on_frame(s_reasm.buf, s_reasm.length);
        }
    }
    return 0;
}

static int gatt_tx_access(uint16_t conn, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg) {
    (void)conn;
    (void)attr;
    (void)ctxt;
    (void)arg;
    return 0;
}

/** 小程序连接流水线的最后一步读这个特征。不实现它，连接会在 readState 处失败。 */
static int gatt_state_access(uint16_t conn, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg) {
    (void)conn;
    (void)attr;
    (void)arg;
    if (ctxt->op != BLE_GATT_ACCESS_OP_READ_CHR) return BLE_ATT_ERR_UNLIKELY;
    if (s_on_state_read == NULL) return BLE_ATT_ERR_UNLIKELY;

    uint8_t buf[PROTO_STATE_BYTES];
    if (!s_on_state_read(buf, sizeof(buf))) return BLE_ATT_ERR_UNLIKELY;
    return os_mbuf_append(ctxt->om, buf, sizeof(buf)) == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
}

bool lumen_ble_notify(const uint8_t *frame, size_t len) {
    if (s_conn_handle == BLE_HS_CONN_HANDLE_NONE) return false;
    struct os_mbuf *om = ble_hs_mbuf_from_flat(frame, (uint16_t)len);
    if (om == NULL) return false;
    const int rc = ble_gatts_notify_custom(s_conn_handle, s_tx_handle, om);
    return rc == 0;
}

bool lumen_ble_connected(void) {
    return s_conn_handle != BLE_HS_CONN_HANDLE_NONE;
}

uint16_t lumen_ble_mtu(void) {
    return s_mtu;
}

static int on_gap_event(struct ble_gap_event *event, void *arg);

static void advertise(void) {
    struct ble_hs_adv_fields fields;
    memset(&fields, 0, sizeof(fields));
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.name = (const uint8_t *)ble_svc_gap_device_name();
    fields.name_len = (uint8_t)strlen((const char *)fields.name);
    fields.name_is_complete = 1;

    int rc = ble_gap_adv_set_fields(&fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "adv fields rc=%d", rc);
        return;
    }

    struct ble_gap_adv_params params;
    memset(&params, 0, sizeof(params));
    params.conn_mode = BLE_GAP_CONN_MODE_UND;
    params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    rc = ble_gap_adv_start(BLE_OWN_ADDR_PUBLIC, NULL, BLE_HS_FOREVER, &params, on_gap_event, NULL);
    if (rc != 0) ESP_LOGE(TAG, "adv start rc=%d", rc);
}

static int on_gap_event(struct ble_gap_event *event, void *arg) {
    (void)arg;
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status == 0) {
            s_conn_handle = event->connect.conn_handle;
            lumen_reasm_reset(&s_reasm);
            ESP_LOGI(TAG, "connected handle=%d", s_conn_handle);
        } else {
            advertise();
        }
        return 0;

    case BLE_GAP_EVENT_DISCONNECT:
        ESP_LOGI(TAG, "disconnected reason=%d", event->disconnect.reason);
        s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
        s_mtu = 23;
        lumen_reasm_reset(&s_reasm);
        advertise();
        return 0;

    case BLE_GAP_EVENT_MTU:
        s_mtu = event->mtu.value;
        ESP_LOGI(TAG, "mtu=%d", s_mtu);
        return 0;

    case BLE_GAP_EVENT_ADV_COMPLETE:
        advertise();
        return 0;

    default:
        return 0;
    }
}

static void on_sync(void) {
    int rc = ble_hs_util_ensure_addr(0);
    if (rc != 0) {
        ESP_LOGE(TAG, "ensure_addr rc=%d", rc);
        return;
    }
    advertise();
}

static void on_reset(int reason) {
    ESP_LOGW(TAG, "host reset reason=%d", reason);
}

static void host_task(void *param) {
    (void)param;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

int lumen_ble_start(const char *device_name, lumen_frame_cb_t on_frame, lumen_state_cb_t on_state_read) {
    s_on_frame = on_frame;
    s_on_state_read = on_state_read;
    lumen_reasm_reset(&s_reasm);

    int rc = nimble_port_init();
    if (rc != 0) {
        ESP_LOGE(TAG, "nimble_port_init rc=%d", rc);
        return rc;
    }

    ble_hs_cfg.sync_cb = on_sync;
    ble_hs_cfg.reset_cb = on_reset;

    ble_svc_gap_init();
    ble_svc_gatt_init();

    rc = ble_gatts_count_cfg(g_services);
    if (rc != 0) return rc;
    rc = ble_gatts_add_svcs(g_services);
    if (rc != 0) return rc;

    rc = ble_svc_gap_device_name_set(device_name);
    if (rc != 0) return rc;

    nimble_port_freertos_init(host_task);
    return 0;
}
