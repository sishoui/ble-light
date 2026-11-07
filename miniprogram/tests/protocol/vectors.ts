/**
 * 测试向量的类型化视图。JSON 是生成物，这里只给它一个形状，
 * 不改数据、不复制数据。
 */
import raw from "../../../docs/protocol-vectors.json";

export interface FrameVector {
  kind: "frame";
  name: string;
  command: string;
  seq: number;
  payload: number[];
  expect_hex: string;
}

export interface FrameShapeVector {
  kind: "frame_shape";
  name: string;
  command: string;
  payloadBytes: number;
  expect_total_bytes: number;
  expect_hex: string;
}

export interface CrcVector {
  kind: "crc";
  name: string;
  input_ascii: string;
  expect_crc: number;
  expect_crc_hex: string;
}

export interface FieldVector {
  kind: "fields";
  name: string;
  command?: string;
  report?: string;
  payload_bytes: number;
  expect_payload_hex: string;
  expect_fields: Array<{ name: string; offset: number; bytes: number; hex: string }>;
}

export type Vector = FrameVector | FrameShapeVector | CrcVector | FieldVector | { kind: string; name: string };

const all = raw.vectors as unknown as Vector[];

export const vectors = {
  all,
  of<K extends Vector["kind"]>(kind: K): Extract<Vector, { kind: K }>[] {
    return all.filter((v) => v.kind === kind) as Extract<Vector, { kind: K }>[];
  },
  find<K extends Vector["kind"]>(kind: K, name: string): Extract<Vector, { kind: K }> {
    const v = all.find((x) => x.kind === kind && x.name === name);
    if (!v) throw new Error(`向量里没有 ${kind}/${name}`);
    return v as Extract<Vector, { kind: K }>;
  },
};
