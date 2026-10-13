import streamlit as st
import tempfile
import os
from src.preprocess.quality_check import run_quality_check

from src.utils.helper import load_config


config = load_config()

st.set_page_config(
    page_title=config["streamlit"]["page_title"],
    page_icon=config["streamlit"]["page_icon"],
    layout="wide"
)

st.title("DMV Lease Verification System")
st.markdown("**Phase 1**: Image Upload → Quality Check")
st.divider()


uploaded_file = st.file_uploader(
    "Upload a lease document image",
    type=["jpg", "jpeg", "png", "tiff"]
)

if uploaded_file is not None:

    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, uploaded_file.name)
    with open(temp_path, "wb") as f:
        f.write(uploaded_file.getbuffer())

    col1, col2, col3 = st.columns([1, 2, 1])

    with col2:
        st.subheader("Original Image")
        st.image(uploaded_file, use_container_width=True)

    st.divider()
    st.subheader("Quality Check Results")

    qc_result = run_quality_check(temp_path, config)

    if qc_result["pass"]:
        st.success("All quality checks passed!")
    else:
        st.error(f"Quality check failed: {qc_result['reason']}")

    checks = qc_result["checks"]
    check_cols = st.columns(4)

    with check_cols[0]:
        if "format" in checks:
            passed = checks["format"]["pass"]
            st.metric("Format", "Pass" if passed else "Fail")

    with check_cols[1]:
        if "file_size" in checks:
            passed = checks["file_size"]["pass"]
            st.metric("File Size", "Pass" if passed else "Fail")

    with check_cols[2]:
        if "resolution" in checks:
            passed = checks["resolution"]["pass"]
            if passed:
                w, h = checks["resolution"]["width"], checks["resolution"]["height"]
                st.metric("Resolution", f"{w}x{h}")
            else:
                st.metric("Resolution", "Too Low")

    with check_cols[3]:
        if "blur" in checks:
            passed = checks["blur"]["pass"]
            if passed:
                score = checks["blur"]["blur_score"]
                st.metric("Blur Score", f"{score}")
            else:
                st.metric("Blur Score", "Too Blurry")
