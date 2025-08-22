#!/usr/bin/env python3
import sys
import os
import re
import struct
import argparse
import math
from typing import Dict, Any, List

# GGUF constants
GGUF_MAGIC = 0x46554747
GGUF_VALUE_TYPE = {
    0: "UINT8", 1: "INT8", 2: "UINT16", 3: "INT16", 4: "UINT32",
    5: "INT32", 6: "FLOAT32", 7: "BOOL", 8: "STRING", 9: "ARRAY",
}

class GGUFMetadataReader:
    """A minimal reader to get only the necessary KV metadata for cache calculation."""
    def __init__(self, path: str):
        self.path = path
        self.metadata: Dict[str, Any] = {}

    def read(self):
        with open(self.path, "rb") as f:
            self.f = f
            magic, _, _, metadata_kv_count = struct.unpack("<IIQQ", self.f.read(24))
            if magic != GGUF_MAGIC: raise ValueError("Invalid GGUF magic number")
            self._read_metadata(metadata_kv_count)
        return self

    def _read_string(self) -> str:
        (length,) = struct.unpack("<Q", self.f.read(8))
        return self.f.read(length).decode("utf-8", errors="replace")

    def _read_value(self, value_type_idx: int):
        value_type = GGUF_VALUE_TYPE.get(value_type_idx)
        if not value_type: raise ValueError(f"Unknown GGUF value type: {value_type_idx}")
        if value_type == "STRING": return self._read_string()
        if value_type == "UINT32": return struct.unpack("<I", self.f.read(4))[0]
        if value_type == "INT32": return struct.unpack("<i", self.f.read(4))[0]
        self._skip_value(value_type_idx)

    def _skip_value(self, value_type_idx: int):
        value_type = GGUF_VALUE_TYPE.get(value_type_idx)
        if not value_type: return
        if value_type in ("UINT8", "INT8", "BOOL"): self.f.seek(1, 1)
        elif value_type in ("UINT16", "INT16"): self.f.seek(2, 1)
        elif value_type in ("UINT32", "INT32", "FLOAT32"): self.f.seek(4, 1)
        elif value_type == "STRING":
            (length,) = struct.unpack("<Q", self.f.read(8))
            self.f.seek(length, 1)
        elif value_type == "ARRAY":
            (array_type_idx, count) = struct.unpack("<IQ", self.f.read(12))
            type_map = {0:1, 1:1, 2:2, 3:2, 4:4, 5:4, 6:4, 7:1, 10:8, 11:8, 12:8}
            element_size = type_map.get(array_type_idx)
            if element_size: self.f.seek(count * element_size, 1)
            else:
                for _ in range(count): self._skip_value(8)

    def _read_metadata(self, count: int):
        keys_to_read = {"general.architecture", "general.name"}
        arch_specific_keys_added = False
        for _ in range(count):
            key = self._read_string()
            (value_type_idx,) = struct.unpack("<I", self.f.read(4))
            if not arch_specific_keys_added and "general.architecture" in self.metadata:
                prefix = self.metadata["general.architecture"]
                keys_to_read.update({
                    f"{prefix}.block_count", f"{prefix}.context_length",
                    f"{prefix}.attention.head_count_kv", f"{prefix}.attention.key_length",
                    f"{prefix}.attention.value_length", f"{prefix}.attention.sliding_window_size"
                })
                arch_specific_keys_added = True
            if key in keys_to_read:
                self.metadata[key] = self._read_value(value_type_idx)
            else:
                self._skip_value(value_type_idx)

def get_total_model_size_from_disk(gguf_file_path: str) -> int:
    """Calculates the total model size by finding all parts on disk."""
    match = re.search(r'-(\d{5})-of-(\d{5})\.gguf$', gguf_file_path, re.IGNORECASE)
    if not match:
        return os.path.getsize(gguf_file_path)

    base_path = gguf_file_path[:match.start()]
    total_parts_str = match.group(2)
    total_parts = int(total_parts_str)
    total_size, found_parts = 0, 0
    for i in range(1, total_parts + 1):
        part_file_name = f"{base_path}-{i:05d}-of-{total_parts_str}.gguf"
        if os.path.exists(part_file_name):
            total_size += os.path.getsize(part_file_name)
            found_parts += 1
    if found_parts != total_parts:
        print(f"WARNING: Expected {total_parts} parts, found {found_parts}. Size calculation may be incomplete.", file=sys.stderr)
    return total_size

def format_mem(size_bytes):
    mib = size_bytes / (1024 * 1024)
    if mib < 1024: return f"{mib:8.2f} MiB"
    return f"{mib / 1024:8.2f} GiB"

def run_estimator(gguf_file: str, context_sizes: List[int], overhead_gib: float):
    try:
        reader = GGUFMetadataReader(gguf_file).read()
        metadata = reader.metadata
        prefix = metadata.get("general.architecture")
        if not prefix: raise KeyError("Could not read 'general.architecture' from model metadata.")
        
        model_size_bytes = get_total_model_size_from_disk(gguf_file)
        overhead_bytes = int(overhead_gib * 1024**3)

        n_layers = metadata[f"{prefix}.block_count"]
        n_head_kv = metadata[f"{prefix}.attention.head_count_kv"]
        training_context = metadata.get(f"{prefix}.context_length", 0)
        n_embd_head_k = metadata[f"{prefix}.attention.key_length"]
        n_embd_head_v = metadata[f"{prefix}.attention.value_length"]
        swa_window_size = metadata.get(f"{prefix}.attention.sliding_window_size", 0)
        
        is_scout_model = "scout" in metadata.get("general.name", "").lower()
        if is_scout_model and swa_window_size == 0: n_layers_swa, n_layers_full, swa_window_size = 36, 12, 8192
        elif swa_window_size > 0: n_layers_swa, n_layers_full = n_layers, 0
        else: n_layers_swa, n_layers_full = 0, n_layers

        print(f"\n--- Model '{metadata.get('general.name', 'N/A')}' ---")
        if training_context > 0: print(f"Max Context: {training_context:,} tokens")
        print(f"Model Size: {format_mem(model_size_bytes).strip()} (from file size)")
        print(f"Incl. Overhead: {overhead_gib:.2f} GiB (for compute buffer, etc. adjustable via --overhead)")
        
        if training_context > 0:
            context_sizes = sorted(list(set([c for c in context_sizes if c <= training_context] + [c for c in [training_context] if c not in context_sizes])))
        else: context_sizes = sorted(context_sizes)
        
        bytes_per_token_per_layer = n_head_kv * (n_embd_head_k + n_embd_head_v) * 2
        
        print("\n--- Memory Footprint Estimation ---")
        print(f"{'Context Size':>15s} | {'Context Memory':>15s} | {'Est. Total VRAM':>15s}")
        print("-" * 51)
        for n_ctx in context_sizes:
            mem_full = n_ctx * n_layers_full * bytes_per_token_per_layer
            mem_swa = min(n_ctx, swa_window_size) * n_layers_swa * bytes_per_token_per_layer
            kv_cache_bytes = mem_full + mem_swa
            total_bytes = model_size_bytes + kv_cache_bytes + overhead_bytes
            print(f"{n_ctx:>15,} | {format_mem(kv_cache_bytes):>15s} | {format_mem(total_bytes):>15s}")
            
    except (FileNotFoundError, ValueError, struct.error, NotImplementedError, KeyError) as e:
        print(f"\nError: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description="Calculate VRAM requirements for a GGUF model, including a configurable overhead for compute buffers.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("gguf_file", help="Path to the GGUF model file (any part of a multi-part model).")
    parser.add_argument("-c", "--contexts", nargs='+', type=int, default=[4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576], help="Space-separated list of context sizes to calculate.")
    parser.add_argument("--overhead", type=float, default=2.0, help="Estimated overhead in GiB for compute buffers, drivers, etc. (default: 2.0)")
    args = parser.parse_args()
    run_estimator(args.gguf_file, args.contexts, args.overhead)

if __name__ == "__main__":
    main()
