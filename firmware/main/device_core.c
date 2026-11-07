/* 设备内核：状态机 + 意图收集。 */
#include "device_core.h"

#include <string.h>

static const char *const KEYS[] = { "state", "layout", "scene0" };
static const uint32_t DEBOUNCE_MS[] = { 500, 0, 2000 };

void device_core_init(device_core_t *dev, uint32_t now_ms) {
    memset(dev, 0, sizeof(*dev));
    dev->state = lumen_state_default();
    lumen_save_init(&dev->saves, KEYS, DEBOUNCE_MS, 3);
    dev->selftest = DEVICE_SELFTEST_IDLE;
    dev->selftest_started_ms = now_ms;
    dev->last_result = RES_OK;
    dev->last_command = 0;
}

void device_core_interrupt_selftest(device_core_t *dev) {
    dev->selftest = DEVICE_SELFTEST_IDLE;
}

uint8_t device_core_handle(device_core_t *dev, const lumen_cmd_t *cmd, uint32_t now_ms,
                           device_effects_t *effects) {
    memset(effects, 0, sizeof(*effects));

    lumen_state_t next;
    lumen_out_t out;
    lumen_command_apply(&dev->state, cmd, &next, &out);

    dev->last_result = out.result;
    dev->last_command = cmd->code;

    if (out.result != RES_OK) {
        return out.result;
    }

    dev->state = next;

    for (int i = 0; i < out.intent_count; i++) {
        switch (out.intents[i].kind) {
        case LUMEN_INTENT_SAVE_STATE:
            lumen_save_mark_dirty(&dev->saves, "state", now_ms);
            break;
        case LUMEN_INTENT_REBUILD_STRIP:
            effects->rebuild_strip = true;
            effects->rebuild_strip_id = out.intents[i].arg;
            break;
        case LUMEN_INTENT_SELF_TEST:
            dev->selftest = DEVICE_SELFTEST_RUNNING;
            dev->selftest_started_ms = now_ms;
            effects->start_selftest = true;
            break;
        case LUMEN_INTENT_NOTIFY_STATE:
            effects->notify_state = true;
            break;
        case LUMEN_INTENT_NOTIFY_STRIP_CFG:
            effects->notify_strip_cfg = true;
            break;
        case LUMEN_INTENT_NOTIFY_DEVICE:
            effects->notify_device = true;
            break;
        default:
            break;
        }
    }

    /* 自检期间任何改状态命令都打断它 */
    if (dev->selftest == DEVICE_SELFTEST_RUNNING && !effects->start_selftest) {
        switch (cmd->code) {
        case CMD_SET_POWER:
        case CMD_SET_BRIGHTNESS:
        case CMD_SET_LED_COUNT:
        case CMD_SET_STRIP_POWER:
            device_core_interrupt_selftest(dev);
            break;
        default:
            break;
        }
    }

    const char *due[SAVE_MAX_KEYS];
    effects->save_count = device_core_collect_saves(dev, now_ms, due, SAVE_MAX_KEYS);
    for (int i = 0; i < effects->save_count; i++) effects->saves[i] = due[i];

    return out.result;
}

int device_core_selftest_phase(const device_core_t *dev, uint32_t now_ms) {
    if (dev->selftest != DEVICE_SELFTEST_RUNNING) return -1;
    const uint32_t elapsed = (uint32_t)(now_ms - dev->selftest_started_ms);
    const uint32_t phase = elapsed / DEVICE_SELFTEST_PHASE_MS;
    if (phase >= DEVICE_SELFTEST_PHASES) return -1;
    return (int)phase;
}

bool device_core_selftest_tick(device_core_t *dev, uint32_t now_ms) {
    if (dev->selftest != DEVICE_SELFTEST_RUNNING) return false;
    const uint32_t elapsed = (uint32_t)(now_ms - dev->selftest_started_ms);
    if (elapsed < DEVICE_SELFTEST_PHASE_MS * DEVICE_SELFTEST_PHASES) return false;
    dev->selftest = DEVICE_SELFTEST_IDLE;
    return true;
}

int device_core_collect_saves(device_core_t *dev, uint32_t now_ms, const char **out, int max) {
    return lumen_save_collect_due(&dev->saves, now_ms, out, max);
}
