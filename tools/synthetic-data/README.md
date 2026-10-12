# Synthetic applicant and lease generator

Generates realistic, fake DMV applicants and matching DC residential lease images, so the
verification pipeline can be built and tested without real personal data.

1. `1_generate_master_data.py` writes 1,000 applicant records (70/30 train/test split) with
   Faker: name, date of birth, DC address, service type and a valid/invalid label.
2. `2_generate_lease_images.py` fills lease page templates (pages 1 and 11) with each
   applicant's details and degrades some images (LOW / MEDIUM resolution tiers, blur, JPEG
   artifacts) to exercise the quality gate.

```bash
pip install faker opencv-python pillow numpy
python 1_generate_master_data.py      # writes master_output/
python 2_generate_lease_images.py     # needs Templates/ (lease_p1.png, lease_p11.png, fonts)
```

The lease templates and fonts are not checked in; place them in `Templates/` before running
the second script.
