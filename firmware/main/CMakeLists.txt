idf_component_register(
    SRCS
        "main.c"
        "protocol.c"
        "chunk_reasm.c"
        "command.c"
        "state_blob.c"
        "save_scheduler.c"
        "device_core.c"
        "gamma.c"
        "ble_link.c"
        "led_strip_owner.c"
        "selftest.c"
        "strip_gpio.c"
    INCLUDE_DIRS "."
    REQUIRES bt nvs_flash esp_driver_rmt led_strip
)
