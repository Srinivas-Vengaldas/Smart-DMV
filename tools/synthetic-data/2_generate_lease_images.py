import csv
import os
import random
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime, timedelta
from faker import Faker

fake = Faker()

BASE_DIR = "master_output"
TEMPLATE_DIR = os.path.join("Templates")
PAGE1_IMG = os.path.join(TEMPLATE_DIR, "lease_p1.png")
PAGE11_IMG = os.path.join(TEMPLATE_DIR, "lease_p11.png")
REGULAR_FONT = os.path.join(TEMPLATE_DIR, "arial.ttf")
SIG_FONT = os.path.join(TEMPLATE_DIR, "Signature.ttf")

def apply_resolution_tier(image_path, tier):
    img = cv2.imread(image_path)
    if img is None: return
    h, w = img.shape[:2]
    
    if tier == "LOW":
        small = cv2.resize(img, (int(w * 0.2), int(h * 0.2)), interpolation=cv2.INTER_LINEAR)
        img = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
        img = cv2.GaussianBlur(img, (9, 9), 0)
        cv2.imwrite(image_path, img, [cv2.IMWRITE_JPEG_QUALITY, 15])
        
    elif tier == "MEDIUM":
        img = cv2.GaussianBlur(img, (3, 3), 0)
        noise = np.random.normal(0, 5, img.shape).astype(np.uint8)
        img = cv2.add(img, noise)
        cv2.imwrite(image_path, img, [cv2.IMWRITE_JPEG_QUALITY, 60])
        
    else: 
        cv2.imwrite(image_path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])

def create_lease_images(row, output_folder):
    app_id = row["Application_ID"]
    error_type = row["Error_Type"]
    status = row["Verification_Status"]
    
    if error_type == "FLAG_LOW_CONFIDENCE":
        res_tier = "LOW"
        
    elif status == "APPROVED":
        res_tier = random.choice(["HIGH", "MEDIUM"])
        
    else:
        res_tier = random.choice(["HIGH", "MEDIUM"])

    tenant_name = f"{row['First_Name']} {row['Last_Name']}"
    prop_address = f"{row['Address_Street']}, {row['Address_City']}, {row['Address_State']} {row['Address_Zip']}"
    
    if error_type == "DOC_NAME_MISMATCH" or error_type == "FLAG_NAME_VARIATION":
        tenant_name = fake.name()
    elif error_type == "DOC_ADDRESS_MISMATCH" or error_type == "FLAG_ADDRESS_FORMAT":
        prop_address = fake.address().replace("\n", ", ")
        
    today = datetime.now()
    if error_type == "DOC_EXPIRED":
        end_date = today - timedelta(days=random.randint(30, 180))
        start_date = end_date - timedelta(days=365)
    else:
        start_date = today - timedelta(days=random.randint(30, 180))
        end_date = start_date + timedelta(days=365)
        
    date_made_str = start_date.strftime("%B %d, %Y")
    start_str = start_date.strftime("%B %d, %Y")
    end_str = end_date.strftime("%B %d, %Y")
    date_signed_str = start_date.strftime("%m/%d/%Y")

    landlord_first = fake.first_name()
    landlord_last = fake.last_name()
    landlord_name = f"{landlord_first} {landlord_last}"
    landlord_phone = f"{random.randint(202, 571)}-{random.randint(200, 999)}-{random.randint(1000, 9999)}"
    landlord_email = f"{landlord_first[0].lower()}{landlord_last.lower()}@{fake.domain_name()}"
    rent_amt = f"{random.randint(1800, 4500)}"
    
    try:
        img1 = Image.open(PAGE1_IMG).convert("RGB")
        width, height = img1.size 
        draw = ImageDraw.Draw(img1)
        
        font_size = int(width * 0.011) 
        font_reg = ImageFont.truetype(REGULAR_FONT, font_size)
        font_bold = ImageFont.truetype(REGULAR_FONT, font_size + 1)

        draw.text((width * 0.25, height * 0.165), date_made_str, fill="black", font=font_reg)
        draw.text((width * 0.60, height * 0.165), landlord_name, fill="black", font=font_bold)
        draw.text((width * 0.25, height * 0.195), tenant_name, fill="black", font=font_bold)
        draw.text((width * 0.20, height * 0.24), prop_address, fill="black", font=font_reg)
        
        draw.text((width * 0.25, height * 0.255), "12 Months", fill="black", font=font_bold)
        draw.text((width * 0.75, height * 0.255), start_str, fill="black", font=font_bold)
        draw.text((width * 0.25, height * 0.27), end_str, fill="black", font=font_bold)

        draw.text((width * 0.57, height * 0.354), rent_amt, fill="black", font=font_bold)
        contact_text = f"Landlord Contact: {landlord_phone} | {landlord_email}"
        draw.text((width * 0.05, height * 0.05), contact_text, fill="darkblue", font=font_reg)

        p1_path = os.path.join(output_folder, f"lease_{app_id}_p1.jpg")
        img1.save(p1_path)
        apply_resolution_tier(p1_path, res_tier)

    except Exception as e:
        print(f"Error P1 {app_id}: {e}")

    try:
        img11 = Image.open(PAGE11_IMG).convert("RGB")
        width, height = img11.size
        draw = ImageDraw.Draw(img11)
        
        sig_size = int(width * 0.02) 
        font_sig = ImageFont.truetype(SIG_FONT, sig_size)
        date_size = int(width * 0.02)
        font_date = ImageFont.truetype(SIG_FONT, date_size)

        draw.text((width * 0.55, height * 0.085), landlord_name, fill="black", font=font_sig)
        draw.text((width * 0.88, height * 0.085), date_signed_str, fill="black", font=font_date)

        if error_type != "DOC_MISSING_SIGNATURE":
            draw.text((width * 0.10, height * 0.085), tenant_name, fill="darkblue", font=font_sig)
            draw.text((width * 0.40, height * 0.085), date_signed_str, fill="black", font=font_date)

        p11_path = os.path.join(output_folder, f"lease_{app_id}_p11.jpg")
        img11.save(p11_path)
        apply_resolution_tier(p11_path, res_tier) 

    except Exception as e:
        print(f"Error P11 {app_id}: {e}")

def process_batch(csv_file, output_subfolder):
    csv_path = os.path.join(BASE_DIR, csv_file)
    out_path = os.path.join(BASE_DIR, output_subfolder)
    
    if not os.path.exists(out_path):
        os.makedirs(out_path)
        
    print(f"Processing {csv_file} -> {out_path}...")
    
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            create_lease_images(row, out_path)
            count += 1
            if count % 50 == 0:
                print(f"  Generated {count} leases...")

if __name__ == "__main__":
    process_batch("train_applicants.csv", "train")
    process_batch("test_applicants.csv", "test")
    print("Done! Dataset fully updated with new alignment.")