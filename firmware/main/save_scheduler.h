/* 保存调度：按 NVS 键的防抖。纯逻辑，不知道 NVS 存在。
 *
 * 三种键各有自己的防抖：state 500ms、layout 0ms（立即）、scene 2000ms。
 * 调用方每帧调 tick，拿到「该存哪些键」的列表。
 */
#ifndef LUMEN_SAVE_SCHEDULER_H
#define LUMEN_SAVE_SCHEDULER_H

#include <stdbool.h>
#include <stdint.h>

#define SAVE_MAX_KEYS 5

typedef struct {
    const char *key;
    uint32_t debounce_ms;
    bool dirty;
    bool pending;
    uint32_t dirty_since_ms;
} lumen_save_slot_t;

typedef struct {
    lumen_save_slot_t slots[SAVE_MAX_KEYS];
    int count;
} lumen_save_scheduler_t;

void lumen_save_init(lumen_save_scheduler_t *s, const char *const *keys, const uint32_t *debounce_ms, int count);

/** 标记某个键脏了。立即键（debounce 0）在下次 tick 就该返回。 */
void lumen_save_mark_dirty(lumen_save_scheduler_t *s, const char *key, uint32_t now_ms);

/** 到点的键返回 true，并清掉 pending。 */
bool lumen_save_due(lumen_save_scheduler_t *s, const char *key, uint32_t now_ms);

/** 取出所有到点的键，最多 max 个，返回个数。 */
int lumen_save_collect_due(lumen_save_scheduler_t *s, uint32_t now_ms, const char **out, int max);

/** 存完一个键后调用：清脏标记。 */
void lumen_save_done(lumen_save_scheduler_t *s, const char *key);

#endif /* LUMEN_SAVE_SCHEDULER_H */
