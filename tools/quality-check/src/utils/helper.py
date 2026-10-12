import os
import yaml
import logging
from pathlib import Path

def load_config(config_path: str = None) -> dict:
    
    if config_path is None:
        project_root = Path(__file__).resolve().parent.parent.parent
        config_path = project_root / "config" / "config.yaml"

    with open(config_path, "r") as f:
        config = yaml.safe_load(f)

    return config

def setup_logger(name: str, level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper()))

    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "[%(asctime)s] %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger


def get_image_files(directory: str, allowed_formats: list = None) -> list:

    if allowed_formats is None:
        allowed_formats = [".jpg", ".jpeg", ".png", ".tiff"]

    image_files = []
    for file in sorted(os.listdir(directory)):
        if Path(file).suffix.lower() in allowed_formats:
            image_files.append(os.path.join(directory, file))

    return image_files


def ensure_directory(path: str) -> None:

    os.makedirs(path, exist_ok=True)