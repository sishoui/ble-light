/* 命令 reducer：纯函数。(state, cmd) → (state', result, intents)。
 *
 * 不碰 NVS、不发通知、不读全局。副作用以意图形式返回，由调用方执行。
 * 校验顺序固定：命令字 → 载荷长度 → 载荷取值。
 */
#ifndef LUMEN_COMMAND_H
#define LUMEN_COMMAND_H

#include <stdint.h>

#include "protocol_gen.h"

typedef struct {
    uint8_t power;
    uint8_t brightness;
    uint8_t max_brightness;
    uint8_t strip_count;
    uint8_t strip_power_mask;
    uint8_t active_scene;
    uint8_t layout_valid;
    uint16_t led_count[PROTO_MAX_STRIPS];
    uint8_t part_count[PROTO_MAX_STRIPS];
} lumen_state_t;

/** 意图类型。reducer 只产出它们，执行是调用方的事。 */
typedef enum {
    LUMEN_INTENT_NONE = 0,
    LUMEN_INTENT_SAVE_STATE,      /* 状态变了，按 500ms 防抖落盘 */
    LUMEN_INTENT_REBUILD_STRIP,   /* 灯珠数变了，异步重建句柄 */
    LUMEN_INTENT_SELF_TEST,       /* 开始四色自检 */
    LUMEN_INTENT_NOTIFY_STATE,    /* 回一帧 StateReport */
    LUMEN_INTENT_NOTIFY_STRIP_CFG,/* 回 StripConfigReport */
    LUMEN_INTENT_NOTIFY_DEVICE,   /* 回 DeviceInfoReport */
} lumen_intent_kind_t;

typedef struct {
    lumen_intent_kind_t kind;
    uint8_t arg;
} lumen_intent_t;

#define LUMEN_MAX_INTENTS 4

typedef struct {
    uint8_t result;
    uint8_t intent_count;
    lumen_intent_t intents[LUMEN_MAX_INTENTS];
} lumen_out_t;

typedef struct {
    uint8_t code;
    uint16_t length;
    uint8_t payload[PROTO_MAX_PAYLOAD];
} lumen_cmd_t;

lumen_state_t lumen_state_default(void);

/**
 * 应用一条命令。合法时写 *next（可等于 *state 的副本），非法时 *next 与 *state 相同。
 * 返回的结果码与意图写在 out。
 */
void lumen_command_apply(const lumen_state_t *state, const lumen_cmd_t *cmd,
                         lumen_state_t *next, lumen_out_t *out);

#endif /* LUMEN_COMMAND_H */
