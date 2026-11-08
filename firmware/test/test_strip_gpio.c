/* 链号 → GPIO 表。这张表错了整条链接在错的脚上，而且现场很难查：
 * 灯不亮时看不出是固件选错脚、线接错、还是灯带坏了。
 */
#include <string.h>

#include "strip_gpio.h"
#include "test_harness.h"

RUN_TEST(gpio_table_covers_all_eight_strips) {
    for (uint8_t i = 0; i < PROTO_MAX_STRIPS; i++) {
        ASSERT_TRUE(lumen_strip_gpio(i) >= 0);
    }
}

RUN_TEST(gpio_table_has_no_duplicates) {
    /* 两条链占同一个脚，它们会永远同步亮——用户分不清哪条是哪条。 */
    for (uint8_t i = 0; i < PROTO_MAX_STRIPS; i++) {
        for (uint8_t j = (uint8_t)(i + 1); j < PROTO_MAX_STRIPS; j++) {
            ASSERT_TRUE(lumen_strip_gpio(i) != lumen_strip_gpio(j));
        }
    }
}

RUN_TEST(gpio_table_avoids_flash_and_usb_pins) {
    /* GPIO11/12/13 是 VDD_SPI 与 flash，GPIO18/19 是 USB。
     * 占用它们会让设备直接起不来。 */
    const int banned[] = { 11, 12, 13, 18, 19 };
    for (uint8_t i = 0; i < PROTO_MAX_STRIPS; i++) {
        for (size_t b = 0; b < sizeof(banned) / sizeof(banned[0]); b++) {
            ASSERT_TRUE(lumen_strip_gpio(i) != banned[b]);
        }
    }
}

RUN_TEST(gpio_out_of_range_returns_minus_one) {
    ASSERT_EQ_U8((uint8_t)(lumen_strip_gpio(PROTO_MAX_STRIPS) == -1 ? 1 : 0), 1);
    ASSERT_EQ_U8((uint8_t)(lumen_strip_gpio(200) == -1 ? 1 : 0), 1);
}

EXPORT_TESTS(strip_gpio) {
    RUN_CASE(gpio_table_covers_all_eight_strips);
    RUN_CASE(gpio_table_has_no_duplicates);
    RUN_CASE(gpio_table_avoids_flash_and_usb_pins);
    RUN_CASE(gpio_out_of_range_returns_minus_one);
}
