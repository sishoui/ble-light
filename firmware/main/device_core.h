/* 设备内核：状态机 + 意图收集。不碰 BLE / NVS / RMT。
 *
 * 这一层回答「收到一帧该发生什么」：谁的状态变了、要存哪些键、要发哪些通知。
 * ESP-IDF 侧只负责把意图翻译成真副作用。
 */
#ifndef LUMEN_DEVICE_CORE_H
#define LUMEN_DEVICE_CORE_H

#include <stdbool.h>
#include <stdint.h>

#include "command.h"
#include "save_scheduler.h"

#define DEVICE_SELFTEST_PHASE_MS 500u
#define DEVICE_SELFTEST_PHASES 4u

typedef enum {
    DEVICE_SELFTEST_IDLE = 0,
    DEVICE_SELFTEST_RUNNING,
} device_selftest_state_t;

typedef struct {
    lumen_state_t state;
    lumen_save_scheduler_t saves;
    device_selftest_state_t selftest;
    uint32_t selftest_started_ms;
    /* 最近一次结果，供串口日志与 ACK 使用 */
    uint8_t last_result;
    uint8_t last_command;
} device_core_t;

typedef struct {
    bool notify_state;
    bool notify_strip_cfg;
    bool notify_device;
    bool rebuild_strip;
    uint8_t rebuild_strip_id;
    bool start_selftest;
    /* 需要落盘的键；count 个 */
    const char *saves[SAVE_MAX_KEYS];
    int save_count;
} device_effects_t;

void device_core_init(device_core_t *dev, uint32_t now_ms);

/**
 * 处理一条命令。返回 ACK 结果码，副作用写进 effects。
 * 任何非法命令都不改状态。
 */
uint8_t device_core_handle(device_core_t *dev, const lumen_cmd_t *cmd, uint32_t now_ms,
                           device_effects_t *effects);

/** 自检阶段（0-3 = 红绿蓝白），不在自检中返回 -1。 */
int device_core_selftest_phase(const device_core_t *dev, uint32_t now_ms);

/** 自检是否该结束；结束后 phase 返回 -1。 */
bool device_core_selftest_tick(device_core_t *dev, uint32_t now_ms);

/** 任何改状态命令打断自检。 */
void device_core_interrupt_selftest(device_core_t *dev);

/** 收集到点的保存键（供主循环调用）。 */
int device_core_collect_saves(device_core_t *dev, uint32_t now_ms, const char **out, int max);

#endif /* LUMEN_DEVICE_CORE_H */
