"""Image Quality Script"""

import os
import numpy as np
import cv2
from pathlib import Path
from src.utils.helper import load_config, setup_logger

logger = setup_logger("quality_check")


def check_file_format(image_path: str, allowed_formats: list) -> dict:
   
    ext = Path(image_path).suffix.lower()
    if ext not in allowed_formats:
        return {
            "pass": False,
            "reason": f"Unsupported format: {ext}. Allowed: {allowed_formats}"
        }
    return {"pass": True}

def check_file_size(image_path: str, max_size_mb: float) -> dict:
   
    file_size_mb = os.path.getsize(image_path) / (1024 * 1024)
    if file_size_mb > max_size_mb:
        return {
            "pass": False,
            "reason": f"File too large: {file_size_mb:.1f}MB. Max allowed: {max_size_mb}MB"
        }
    return {"pass": True}


def check_resolution(image: np.ndarray, min_width: int, min_height: int) -> dict:
    
    h, w = image.shape[:2]
    if w < min_width or h < min_height:
        return {
            "pass": False,
            "reason": f"Resolution too low: {w}x{h}. Minimum required: {min_width}x{min_height}"
        }
    return {"pass": True, "width": w, "height": h}


def check_blur(image: np.ndarray, min_blur_score: float) -> dict:
    
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    smooth = cv2.medianBlur(gray, 3)
    blur_score = cv2.Laplacian(smooth, cv2.CV_64F).var()

    if blur_score < min_blur_score:
        return {
            "pass": False,
            "reason": f"Image too blurry. Blur score: {blur_score:.1f}. Minimum required: {min_blur_score}"
        }
    return {"pass": True, "blur_score": round(blur_score, 2)}


def run_quality_check(image_path: str, config: dict = None) -> dict:
    
    if config is None:
        config = load_config()

    qc_config = config["quality_check"]
    results = {}

    
    logger.info(f"Checking file format: {image_path}")
    results["format"] = check_file_format(image_path, qc_config["allowed_formats"])
    if not results["format"]["pass"]:
        logger.warning(f"Format check failed: {results['format']['reason']}")
        return {"pass": False, "checks": results, "reason": results["format"]["reason"]}

    
    logger.info("Checking file size...")
    results["file_size"] = check_file_size(image_path, qc_config["max_file_size_mb"])
    if not results["file_size"]["pass"]:
        logger.warning(f"File size check failed: {results['file_size']['reason']}")
        return {"pass": False, "checks": results, "reason": results["file_size"]["reason"]}

   
    image = cv2.imread(image_path)
    if image is None:
        reason = "Could not read image file. File may be corrupted."
        logger.error(reason)
        return {"pass": False, "checks": results, "reason": reason}

   
    logger.info("Checking resolution...")
    results["resolution"] = check_resolution(image, qc_config["min_width"], qc_config["min_height"])
    if not results["resolution"]["pass"]:
        logger.warning(f"Resolution check failed: {results['resolution']['reason']}")
        return {"pass": False, "checks": results, "reason": results["resolution"]["reason"]}

   
    logger.info("Checking blurriness...")
    results["blur"] = check_blur(image, qc_config["min_blur_score"])
    if not results["blur"]["pass"]:
        logger.warning(f"Blur check failed: {results['blur']['reason']}")
        return {"pass": False, "checks": results, "reason": results["blur"]["reason"]}

    logger.info("All quality checks passed")
    return {"pass": True, "checks": results, "reason": None}