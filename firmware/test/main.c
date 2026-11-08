/* 宿主机测试入口。跑全部已注册用例，非 0 退出即失败。 */
#include "test_harness.h"

void lumen_register_protocol(void);
void lumen_register_command(void);
void lumen_register_storage(void);
void lumen_register_device_core(void);
void lumen_register_strip_gpio(void);

int main(void) {
    lumen_register_protocol();
    lumen_register_command();
    lumen_register_storage();
    lumen_register_device_core();
    lumen_register_strip_gpio();
    int failed = lumen_test_run_all();
    return failed == 0 ? 0 : 1;
}
