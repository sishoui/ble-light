/* GENERATED — DO NOT EDIT. Source: docs/protocol.json, generator: scripts/gen-protocol.mjs */
#ifndef BLE_LIGHT_PROTOCOL_GEN_H
#define BLE_LIGHT_PROTOCOL_GEN_H

#include <stdint.h>

#define PROTO_MAGIC              0xA6u
#define PROTO_VERSION            0x01u
#define PROTO_HEADER_BYTES       8u
#define PROTO_MAX_PAYLOAD        232u
#define PROTO_MAX_FRAME          240u
#define PROTO_CRC_INIT           0xFFFFu
#define PROTO_CRC_POLY           0x1021u

#define PROTO_MAX_LEDS           100u
#define PROTO_MAX_STRIPS         8u
#define PROTO_MAX_PARTS          8u
#define PROTO_MAX_PART_SEGS      8u
#define PROTO_MAX_STEPS          8u
#define PROTO_MAX_SCENES         3u
#define PROTO_MAX_LAYERS         2u
#define PROTO_NAME_BYTES         24u
#define PROTO_STEP_MIN_MS        100u
#define PROTO_STEP_MAX_MS        60000u
#define PROTO_LAYER_LEVEL_MAX    100u
#define PROTO_LAYER_BYTES        9u
#define PROTO_STATE_BYTES        32u
#define PROTO_LAYOUT_PART_BYTES  29u
#define PROTO_LAYOUT_REPORT_BYTES 45u
#define PROTO_SCENE_STEP_BYTES   24u
#define PROTO_SCENE_NAME_BYTES   26u

/* commands */
#define CMD_SETPOWER 0x01u
#define CMD_SETBRIGHTNESS 0x02u
#define CMD_QUERYSTATE 0x05u
#define CMD_SETLEDCOUNT 0x06u
#define CMD_SELFTEST 0x07u
#define CMD_SETSTRIPPOWER 0x1Bu
#define CMD_QUERYSTRIPCONFIG 0x1Cu
#define CMD_QUERYDEVICEINFO 0x1Du
#define CMD_LAYOUTWRITE 0x20u
#define CMD_LAYOUTPART 0x21u
#define CMD_LAYOUTSEG 0x22u
#define CMD_LAYOUTCOMMIT 0x23u
#define CMD_QUERYLAYOUT 0x24u
#define CMD_SCENEPART 0x25u
#define CMD_SCENESTEP 0x26u
#define CMD_SCENENAME 0x27u
#define CMD_ACTIVATESCENE 0x28u
#define CMD_QUERYSCENE 0x29u

/* reports */
#define RPT_ACK 0x80u
#define RPT_EVENT 0x81u
#define RPT_STATEREPORT 0x82u
#define RPT_STRIPCONFIGREPORT 0x87u
#define RPT_DEVICEINFOREPORT 0x88u
#define RPT_LAYOUTREPORT 0x89u
#define RPT_LAYOUTLISTEND 0x8Au
#define RPT_SCENEPARTREPORT 0x8Bu
#define RPT_SCENESTEPREPORT 0x8Cu
#define RPT_SCENELISTEND 0x8Du

/* result codes */
#define RES_OK 0x00u
#define RES_INVALIDPARAM 0x01u
#define RES_UNKNOWNCOMMAND 0x02u
#define RES_BADCHECKSUM 0x03u
#define RES_BADLENGTH 0x04u
#define RES_BUSY 0x05u
#define RES_STORAGEFAILED 0x06u
#define RES_UNSUPPORTEDVERSION 0x07u
#define RES_BADMAGIC 0x08u
#define RES_INTERNALERROR 0x09u

#endif /* BLE_LIGHT_PROTOCOL_GEN_H */
