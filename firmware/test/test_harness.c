/* 测试 harness 的唯一状态副本。 */
#include "test_harness.h"

#define LUMEN_MAX_TESTS 512

typedef struct {
    const char *name;
    lumen_test_fn fn;
} lumen_test_entry_t;

static lumen_test_entry_t g_tests[LUMEN_MAX_TESTS];
static int g_test_count = 0;

int g_test_failed = 0;
const char *g_current_test = "";

void lumen_test_register(const char *name, lumen_test_fn fn) {
    if (g_test_count < LUMEN_MAX_TESTS) {
        g_tests[g_test_count].name = name;
        g_tests[g_test_count].fn = fn;
        g_test_count++;
    }
}

int lumen_test_run_all(void) {
    for (int i = 0; i < g_test_count; i++) {
        g_current_test = g_tests[i].name;
        const int before = g_test_failed;
        g_tests[i].fn();
        if (g_test_failed == before) {
            printf("ok   %s\n", g_tests[i].name);
        }
    }
    printf("\n%d tests, %d failed\n", g_test_count, g_test_failed);
    return g_test_failed;
}
