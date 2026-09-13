from __future__ import annotations

import argparse
import inspect
import os
from typing import Optional

import uvicorn


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def resolve_project_root() -> str:
    return os.path.abspath(os.getenv("ACESTEP_PROJECT_ROOT") or os.getcwd())


def apply_env_from_args(args: argparse.Namespace) -> None:
    if args.api_key:
        os.environ["ACESTEP_API_KEY"] = args.api_key

    if args.download_source and args.download_source != "auto":
        os.environ["ACESTEP_DOWNLOAD_SOURCE"] = args.download_source
        print(f"Using preferred download source: {args.download_source}")

    if args.init_llm:
        os.environ["ACESTEP_INIT_LLM"] = "true"
        print("[API Server] LLM initialization enabled via --init-llm")

    if args.lm_model_path:
        os.environ["ACESTEP_LM_MODEL_PATH"] = args.lm_model_path
        print(f"[API Server] Using LM model: {args.lm_model_path}")

    if args.no_init:
        os.environ["ACESTEP_NO_INIT"] = "true"
        print("[API Server] --no-init: Models will NOT be loaded at startup (lazy load on first request)")


def install_compatibility_patches() -> None:
    """Patch older ACE-Step installs to match newer REST route expectations."""
    try:
        from acestep.training.dataset_builder_modules.label_all import LabelAllMixin
    except Exception:
        return

    existing = getattr(LabelAllMixin, "label_all_samples", None)
    if existing is None or getattr(existing, "_ace_step_ui_compat", False):
        return

    params = inspect.signature(existing).parameters
    required = {"chunk_size", "batch_size", "sample_labeled_callback"}
    if required.issubset(params):
        return

    def label_all_samples_compat(
        self,
        dit_handler,
        llm_handler,
        format_lyrics: bool = False,
        transcribe_lyrics: bool = False,
        skip_metas: bool = False,
        only_unlabeled: bool = False,
        chunk_size: int | None = None,
        batch_size: int | None = None,
        progress_callback=None,
        sample_labeled_callback=None,
    ):
        del chunk_size, batch_size

        if not self.samples:
            return [], "❌ No samples to label. Please scan a directory first."

        if only_unlabeled:
            samples_to_label = [
                (i, sample) for i, sample in enumerate(self.samples) if not sample.labeled or not sample.caption
            ]
        else:
            samples_to_label = [(i, sample) for i, sample in enumerate(self.samples)]

        if not samples_to_label:
            return self.samples, "✅ All samples already labeled"

        success_count = 0
        fail_count = 0
        total = len(samples_to_label)

        for idx, (sample_idx, sample) in enumerate(samples_to_label, start=1):
            if progress_callback:
                progress_callback(f"Labeling {idx}/{total}: {sample.filename}")

            labeled_sample, status = self.label_sample(
                sample_idx,
                dit_handler,
                llm_handler,
                format_lyrics,
                transcribe_lyrics,
                skip_metas,
                progress_callback,
            )

            if "✅" in status:
                success_count += 1
                if sample_labeled_callback:
                    try:
                        sample_labeled_callback(sample_idx, labeled_sample, status)
                    except Exception as exc:
                        print(f"[API Server] sample_labeled_callback failed for sample {sample_idx}: {exc}")
            else:
                fail_count += 1

        status_msg = f"✅ Labeled {success_count}/{total} samples"
        if fail_count > 0:
            status_msg += f" ({fail_count} failed)"
        if only_unlabeled:
            status_msg += f" (unlabeled only, {len(self.samples)} total)"

        return self.samples, status_msg

    label_all_samples_compat._ace_step_ui_compat = True
    LabelAllMixin.label_all_samples = label_all_samples_compat
    print("[API Server] Installed label_all_samples compatibility patch")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ACE-Step API server bootstrap")
    parser.add_argument(
        "--host",
        default=os.getenv("ACESTEP_API_HOST", "127.0.0.1"),
        help="Bind host (default from ACESTEP_API_HOST or 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("ACESTEP_API_PORT", "8001")),
        help="Bind port (default from ACESTEP_API_PORT or 8001)",
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default=os.getenv("ACESTEP_API_KEY"),
        help="API key for authentication (default from ACESTEP_API_KEY)",
    )
    parser.add_argument(
        "--download-source",
        type=str,
        choices=["huggingface", "modelscope", "auto"],
        default=os.getenv("ACESTEP_DOWNLOAD_SOURCE", "auto"),
        help="Preferred model download source",
    )
    parser.add_argument(
        "--init-llm",
        action="store_true",
        default=env_bool("ACESTEP_INIT_LLM", False),
        help="Initialize the LLM at startup",
    )
    parser.add_argument(
        "--lm-model-path",
        type=str,
        default=os.getenv("ACESTEP_LM_MODEL_PATH", ""),
        help="LM model to load at startup",
    )
    parser.add_argument(
        "--no-init",
        action="store_true",
        default=env_bool("ACESTEP_NO_INIT", False),
        help="Skip model loading at startup",
    )
    return parser


def main(argv: Optional[list[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    apply_env_from_args(args)

    project_root = resolve_project_root()
    os.environ["ACESTEP_PROJECT_ROOT"] = project_root
    print(f"[API Server] Project root override: {project_root}")

    import acestep.api_server as api_server

    install_compatibility_patches()
    api_server._get_project_root = resolve_project_root
    api_server.app = api_server.create_app()

    uvicorn.run(
        api_server.app,
        host=str(args.host),
        port=int(args.port),
        reload=False,
        workers=1,
    )


if __name__ == "__main__":
    main()
