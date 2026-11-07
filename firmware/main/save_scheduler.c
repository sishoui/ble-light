/* 保存调度：按 NVS 键的防抖纯逻辑。 */
#include "save_scheduler.h"

#include <string.h>

void lumen_save_init(lumen_save_scheduler_t *s, const char *const *keys, const uint32_t *debounce_ms, int count) {
    memset(s, 0, sizeof(*s));
    if (count > SAVE_MAX_KEYS) count = SAVE_MAX_KEYS;
    s->count = count;
    for (int i = 0; i < count; i++) {
        s->slots[i].key = keys[i];
        s->slots[i].debounce_ms = debounce_ms[i];
    }
}

static lumen_save_slot_t *find(lumen_save_scheduler_t *s, const char *key) {
    for (int i = 0; i < s->count; i++) {
        if (s->slots[i].key != NULL && strcmp(s->slots[i].key, key) == 0) return &s->slots[i];
    }
    return NULL;
}

void lumen_save_mark_dirty(lumen_save_scheduler_t *s, const char *key, uint32_t now_ms) {
    lumen_save_slot_t *slot = find(s, key);
    if (slot == NULL) return;
    slot->dirty = true;
    slot->pending = true;
    slot->dirty_since_ms = now_ms;
}

bool lumen_save_due(lumen_save_scheduler_t *s, const char *key, uint32_t now_ms) {
    lumen_save_slot_t *slot = find(s, key);
    if (slot == NULL || !slot->dirty || !slot->pending) return false;
    return (uint32_t)(now_ms - slot->dirty_since_ms) >= slot->debounce_ms;
}

int lumen_save_collect_due(lumen_save_scheduler_t *s, uint32_t now_ms, const char **out, int max) {
    int n = 0;
    for (int i = 0; i < s->count && n < max; i++) {
        lumen_save_slot_t *slot = &s->slots[i];
        if (!slot->dirty || !slot->pending) continue;
        if ((uint32_t)(now_ms - slot->dirty_since_ms) < slot->debounce_ms) continue;
        out[n++] = slot->key;
    }
    return n;
}

void lumen_save_done(lumen_save_scheduler_t *s, const char *key) {
    lumen_save_slot_t *slot = find(s, key);
    if (slot == NULL) return;
    slot->dirty = false;
    slot->pending = false;
}
