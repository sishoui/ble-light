/* BLE 链路：NimBLE GATT server、广播、RX 分片喂入、TX 通知。
 *
 * 只做搬运：收到的完整帧交给 main 的回调，发出的字节由调用方给。
 */
#ifndef LUMEN_BLE_LINK_H
#define LUMEN_BLE_LINK_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef void (*lumen_frame_cb_t)(const uint8_t *frame, size_t len);

/** 初始化 NimBLE、注册 GATT、开始广播。返回 0 成功。 */
int lumen_ble_start(const char *device_name, lumen_frame_cb_t on_frame);

/** 发一帧通知。没有连接时返回 false。 */
bool lumen_ble_notify(const uint8_t *frame, size_t len);

/** 是否有活动连接。 */
bool lumen_ble_connected(void);

/** 当前协商的 MTU（未连接返回 23）。 */
uint16_t lumen_ble_mtu(void);

#endif /* LUMEN_BLE_LINK_H */
