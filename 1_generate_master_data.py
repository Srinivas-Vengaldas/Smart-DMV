import csv
import random
import os
from faker import Faker
from datetime import datetime, timedelta

fake = Faker()

TOTAL_SAMPLES = 1000
TRAIN_RATIO = 0.7
OUTPUT_DIR = "master_output"

DC_ZIP_CODES = [20001, 20002, 20003, 20004, 20005, 20009, 20011, 20032, 20036]
VA_MD_ZIPS = [22201, 22209, 20814, 20815, 20120]
EYE_COLORS = ["Brown", "Blue", "Green", "Hazel", "Gray", "Black"]
HAIR_COLORS = ["Black", "Brown", "Blond", "Red", "Gray", "Bald", "White"]
PARTIES = ["Democratic Party", "DC Statehood Green Party", "Republican Party", "No Party (independent)", "Other"]

def generate_record(app_id, dataset_split):

    is_valid = random.choice([True, False])
    
    gender = random.choice(["Male", "Female", "Unspecified"])
    first = fake.first_name_male() if gender == "Male" else fake.first_name_female()
    last = fake.last_name()
    middle = fake.first_name() if random.random() > 0.3 else ""
    suffix = random.choice(["Jr.", "Sr.", "III", ""]) if random.random() < 0.1 else ""
    
    service_type = random.choice(["Driver License", "Identification Card", "Motorcycle Endorsement"])
    
    state = "DC"
    city = "Washington"
    zip_code = random.choice(DC_ZIP_CODES)
    street = fake.street_address()
    apt = f"Apt {random.randint(100, 9999)}" if random.random() < 0.4 else ""
    
    dob = fake.date_of_birth(minimum_age=18, maximum_age=85)
    age = (datetime.now().date() - dob).days // 365
    
    ssn = fake.ssn()
    us_citizen = "Yes"
    
    height_ft = random.randint(4, 6)
    height_in = random.randint(0, 11)
    weight = random.randint(100, 300)
    eye = random.choice(EYE_COLORS)
    hair = random.choice(HAIR_COLORS)
    
    phone = f"202-{random.randint(200, 999)}-{random.randint(1000, 9999)}"
    alt_phone = f"703-{random.randint(200, 999)}-{random.randint(1000, 9999)}" if random.random() < 0.3 else ""
    email = f"{first.lower()}.{last.lower()}@{fake.domain_name()}"
    text_notif = random.choice(["Yes", "No"])
    prev_names = fake.last_name() if random.random() < 0.1 else ""

    prev_license = "Yes" if age > 20 else "No"
    prev_loc = "VA" if prev_license == "Yes" else ""
    suspended = "No"
    denied = "No"

    glasses = random.choice(["Yes", "No"])
    hearing_device = "No"
    med_alzheimers = "No"
    med_diabetes = "No"
    med_eye_disease = "No"
    med_seizure = "No"
    med_impairment = "No"

    selective_service = "Registered" if (gender == "Male" and 18 <= age <= 26) else "N/A"
    veteran = "Yes" if random.random() < 0.1 else "No"
    organ_donor = random.choice(["Yes", "No"])
    language = "English"
    spec_autism = False
    spec_visual = False
    spec_intellectual = False
    spec_hearing = False

    practitioner_name = ""
    practitioner_lic = ""
    practitioner_safe = ""
    practitioner_date = ""
    
    if age >= 70:
        practitioner_name = f"Dr. {fake.last_name()}"
        practitioner_lic = str(random.randint(10000, 99999))
        practitioner_safe = "Yes"
        practitioner_date = (datetime.now() - timedelta(days=random.randint(1, 30))).strftime("%m/%d/%Y")

    voter_decline = random.choice(["Yes", "No"])
    voter_party = ""
    voter_poll_worker = ""
    if voter_decline == "No":
        voter_party = random.choice(PARTIES)
        voter_poll_worker = random.choice(["Yes", "No"])
        
    cert_date = datetime.now().strftime("%m/%d/%Y")

    rand_val = random.random()
    
    status = "APPROVED"
    reason = "None"
    error_type = "None"

    if rand_val < 0.40:
        status = "APPROVED"
        
    elif rand_val < 0.70:
        status = "REJECTED"
        failure_modes = [
            "APP_UNDERAGE",             # Age < 16
            "APP_NON_RESIDENT",         # VA/MD Address
            "APP_CITIZENSHIP",          # US Citizen = No
            "DOC_EXPIRED",              # Lease Expired
            "DOC_MISSING_SIGNATURE",    # Unsigned Lease
            "APP_UNSIGNED",             # Unsigned App
            "APP_PREV_DENIAL",          # Denied in other state
            "APP_MED_ALZHEIMERS"        # Alzheimers = Automatic Stop
        ]
        error_type = random.choice(failure_modes)

    else:
        status = "MANUAL_REVIEW"
        flag_modes = [
            "FLAG_LOW_CONFIDENCE",      # Blurry Image
            "FLAG_NAME_VARIATION",      # Chris vs Christopher
            "FLAG_ADDRESS_FORMAT",      # Apt 4B vs Unit 4-B
            "FLAG_MED_VISION",          # Glaucoma Checked
            "FLAG_MED_SEIZURE",         # Seizure Checked
            "FLAG_HISTORY_SUSPENSION",  # Suspension Checked
            "FLAG_AGE_70_REVIEW"        # Age 70+ needs Doc Check
        ]
        error_type = random.choice(flag_modes)
        
        if error_type == "FLAG_LOW_CONFIDENCE":
            reason = "AI Confidence Score < 70%"

        elif error_type == "FLAG_NAME_VARIATION":
            reason = "Name Mismatch (Fuzzy Match Detected)"
            
        elif error_type == "FLAG_ADDRESS_FORMAT":
            reason = "Address Mismatch (Format Variation)"
            
        elif error_type == "FLAG_MED_VISION":
            reason = "Medical Review Required: Vision"
            
        elif error_type == "FLAG_MED_SEIZURE":
            reason = "Medical Review Required: Seizure History"
            med_seizure = "Yes" # Section D.4
            
        elif error_type == "FLAG_HISTORY_SUSPENSION":
            reason = "Review Required: Prior Suspension"
            suspended = "Yes" # Section C.2
            
        elif error_type == "FLAG_AGE_70_REVIEW":
            reason = "Senior Citizen Medical Certification Review"
            dob = fake.date_of_birth(minimum_age=70, maximum_age=75)
            age = (datetime.now().date() - dob).days // 365
            # Ensure Section F is filled out validly, but flag it for human check
            practitioner_name = f"Dr. {fake.last_name()}"
            practitioner_safe = "Yes"
            practitioner_date = (datetime.now() - timedelta(days=5)).strftime("%m/%d/%Y")


    # --- 3. BUILD RECORD (Flattened for CSV) ---
    return {
        # Metadata
        "Application_ID": app_id,
        "Dataset_Split": dataset_split,
        "Verification_Status": status,
        "Rejection_Reason": reason,
        "Error_Type": error_type,
        
        # Section A
        "App_Service_Type": service_type,
        
        # Section B
        "Last_Name": last,
        "First_Name": first,
        "Middle_Name": middle,
        "Suffix": suffix,
        "Address_Street": street,
        "Address_Apt": apt,
        "Address_City": city,
        "Address_State": state,
        "Address_Zip": zip_code,
        "DOB": dob.strftime("%m/%d/%Y"),
        "Age": age,
        "SSN": ssn,
        "US_Citizen": us_citizen,
        "Gender": gender,
        "Height_FT": height_ft,
        "Height_IN": height_in,
        "Weight_LBS": weight,
        "Eye_Color": eye,
        "Hair_Color": hair,
        "Cell_Phone": phone,
        "Alt_Phone": alt_phone,
        "Email": email,
        "Text_Notification": text_notif,
        "Previous_Names": prev_names,
        
        # Section C
        "Hist_Prev_License": prev_license,
        "Hist_Prev_Location": prev_loc,
        "Hist_Suspended": suspended,
        "Hist_Denied": denied,
        
        # Section D
        "Med_Glasses": glasses,
        "Med_Hearing_Aid": hearing_device,
        "Med_Alzheimers": med_alzheimers,
        "Med_Diabetes": med_diabetes,
        "Med_Eye_Disease": med_eye_disease,
        "Med_Seizure": med_seizure,
        "Med_Other_Impairment": med_impairment,
        
        # Section E
        "Pref_Selective_Service": selective_service,
        "Pref_Veteran": veteran,
        "Pref_Organ_Donor": organ_donor,
        "Pref_Language": language,
        "Spec_Autism": spec_autism,
        "Spec_Visual": spec_visual,
        "Spec_Intellectual": spec_intellectual,
        "Spec_Hearing": spec_hearing,
        
        # Section F
        "Age70_Practitioner_Name": practitioner_name,
        "Age70_License_Num": practitioner_lic,
        "Age70_Safe_To_Drive": practitioner_safe,
        "Age70_Cert_Date": practitioner_date,
        
        # Section G
        "Voter_Decline": voter_decline,
        "Voter_Party": voter_party,
        "Voter_Poll_Worker": voter_poll_worker,
        
        # Section H
        "Cert_Signature": f"{first} {last}",
        "Cert_Date": cert_date
    }

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    records = []
    
    # Generate all records
    for i in range(TOTAL_SAMPLES):
        split = "train" if i < (TOTAL_SAMPLES * TRAIN_RATIO) else "test"
        app_id = f"APP-{str(i).zfill(4)}"
        records.append(generate_record(app_id, split))
        
    # Split list
    train_data = [r for r in records if r["Dataset_Split"] == "train"]
    test_data = [r for r in records if r["Dataset_Split"] == "test"]
    
    # Save CSVs
    headers = records[0].keys()
    
    with open(os.path.join(OUTPUT_DIR, "train_applicants.csv"), "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(train_data)
        
    with open(os.path.join(OUTPUT_DIR, "test_applicants.csv"), "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(test_data)
        
    print(f"Successfully generated {len(train_data)} Train and {len(test_data)} Test records.")
    print(f"Schema includes Sections A-H fields (60+ columns).")

if __name__ == "__main__":
    main()