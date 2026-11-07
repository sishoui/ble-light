/* 宿主机测试的最小 harness。不引第三方框架。
 *
 * 为什么用显式注册而不是 constructor：链接器会丢弃没被引用的目标文件，
 * 自动注册的用例就静默消失——「0 tests, 0 failed」比红灯更危险。
 *
 * 状态在 test_harness.c 里只有一份。头文件里放全局变量会让每个 .c 各有一份拷贝。
 */
#ifndef LUMEN_TEST_HARNESS_H
#define LUMEN_TEST_HARNESS_H

#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef void (*lumen_test_fn)(void);

void lumen_test_register(const char *name, lumen_test_fn fn);
int lumen_test_run_all(void);

extern int g_test_failed;
extern const char *g_current_test;

#define RUN_TEST(name)                                                        \
    static void lumen_test_##name(void);                                      \
    static void lumen_register_case_##name(void) {                            \
        lumen_test_register(#name, lumen_test_##name);                        \
    }                                                                         \
    static void lumen_test_##name(void)

#define FAIL_(fmt, ...)                                                       \
    do {                                                                      \
        g_test_failed++;                                                      \
        fprintf(stderr, "FAIL %s (%s:%d): " fmt "\n",                         \
                g_current_test, __FILE__, __LINE__, __VA_ARGS__);             \
    } while (0)

#define ASSERT_TRUE(cond)                                                     \
    do {                                                                      \
        if (!(cond)) FAIL_("expected true: %s", #cond);                        \
    } while (0)

#define ASSERT_FALSE(cond)                                                    \
    do {                                                                      \
        if (cond) FAIL_("expected false: %s", #cond);                          \
    } while (0)

#define ASSERT_EQ_U8(actual, expected)                                        \
    do {                                                                      \
        unsigned long a_ = (unsigned long)(actual);                            \
        unsigned long e_ = (unsigned long)(expected);                          \
        if (a_ != e_) FAIL_("%s = 0x%lx, expected 0x%lx", #actual, a_, e_);    \
    } while (0)

#define ASSERT_EQ_U16(actual, expected) ASSERT_EQ_U8(actual, expected)
#define ASSERT_EQ_SZ(actual, expected)  ASSERT_EQ_U8(actual, expected)

#define ASSERT_EQ_STR(actual, expected)                                       \
    do {                                                                      \
        const char *a_ = (actual);                                             \
        const char *e_ = (expected);                                           \
        if (a_ == NULL || e_ == NULL || strcmp(a_, e_) != 0)                   \
            FAIL_("%s = \"%s\", expected \"%s\"", #actual, a_ ? a_ : "(null)", e_); \
    } while (0)

/** 测试文件末尾用它导出本文件的用例：EXPORT_TESTS(protocol) { RUN_CASE(a); ... } */
#define EXPORT_TESTS(suite) void lumen_register_##suite(void)

#define RUN_CASE(name) lumen_register_case_##name()

#endif /* LUMEN_TEST_HARNESS_H */
