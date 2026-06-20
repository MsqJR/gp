import os
import django
import sys
import requests
from threading import Thread
import time
from datetime import datetime, timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'medify_backend.settings')
django.setup()

from core.models import User, WebsiteSetup
from hospitals.models import HospitalProfile, Doctor, DoctorSchedule, Department, Appointment

def run_tests():
    print("\n[QA SETUP] Initializing test data...")
    user, created = User.objects.get_or_create(
        email='qatest@example.com', 
        defaults={'name': 'QA User', 'business_type': 'hospital'}
    )
    if created:
        user.set_password('password123')
        user.save()

    setup, _ = WebsiteSetup.objects.get_or_create(user=user, defaults={'subdomain': 'qatest'})
    profile, _ = HospitalProfile.objects.get_or_create(website_setup=setup, defaults={'name': 'QA Hospital'})

    dept, _ = Department.objects.get_or_create(website_setup=setup, name='Cardiology')
    doctor, _ = Doctor.objects.get_or_create(website_setup=setup, department=dept, name='Dr. Smith', specialty='Heart', is_active=True)

    today = datetime.now()
    today_weekday = today.weekday()
    
    DoctorSchedule.objects.filter(doctor=doctor).delete()
    DoctorSchedule.objects.create(
        doctor=doctor,
        day_of_week=today_weekday,
        start_time='09:00:00',
        end_time='17:00:00',
        slot_duration_minutes=30
    )

    base_url = 'http://127.0.0.1:8000/api/hospital'
    subdomain = 'qatest'
    date_str = today.strftime('%Y-%m-%d')
    doc_id = str(doctor.id)

    print("\n--- PART 1: PUBLIC APIs ---")
    
    res = requests.get(f"{base_url}/public/pages/?subdomain={subdomain}")
    print(f"GET Pages: {res.status_code}")
    
    res = requests.get(f"{base_url}/public/doctors/?subdomain={subdomain}")
    print(f"GET Doctors: {res.status_code}")
    
    res = requests.get(f"{base_url}/public/departments/?subdomain={subdomain}")
    print(f"GET Departments: {res.status_code}")

    res = requests.get(f"{base_url}/public/doctors/?subdomain=invalid_subdomain_xyz")
    print(f"GET Doctors (Invalid Subdomain): {res.status_code}")

    print("\n--- PART 2: SLOT ENGINE ---")
    res = requests.get(f"{base_url}/booking/available_slots/?doctor_id={doc_id}&date={date_str}")
    print(f"GET Slots (Valid Day): {res.status_code}, Found: {len(res.json().get('slots', []))} slots")
    slots = res.json().get('slots', [])
    
    # Non-working day
    tomorrow = today + timedelta(days=1)
    tomorrow_str = tomorrow.strftime('%Y-%m-%d')
    res = requests.get(f"{base_url}/booking/available_slots/?doctor_id={doc_id}&date={tomorrow_str}")
    print(f"GET Slots (Non-working Day): {res.status_code}, Found: {len(res.json().get('slots', []))} slots")
    
    res = requests.get(f"{base_url}/booking/available_slots/?doctor_id=invalid-uuid-format&date={date_str}")
    print(f"GET Slots (Invalid Doctor ID): {res.status_code}")

    print("\n--- PART 3: BOOKING API ---")
    if not slots:
        print("ERROR: No slots found to test booking!")
        return

    target_slot = slots[0]
    payload = {
        "doctor_id": doc_id,
        "start_datetime": target_slot['start_datetime'],
        "end_datetime": target_slot['end_datetime'],
        "patient_name": "QA Patient",
        "patient_email": "qa@example.com",
        "patient_phone": "1234567890"
    }

    # Clear previous appointments for this slot
    Appointment.objects.filter(doctor=doctor, start_datetime=target_slot['start_datetime']).delete()

    res = requests.post(f"{base_url}/booking/create_appointment/", json=payload)
    print(f"POST Booking (Valid): {res.status_code} - {res.text[:50]}")

    res = requests.post(f"{base_url}/booking/create_appointment/", json=payload)
    print(f"POST Booking (Double Booking): {res.status_code} - {res.text[:50]}")

    print("\n--- PART 4: CONCURRENCY TEST ---")
    target_slot_2 = slots[1]
    payload_2 = {
        "doctor_id": doc_id,
        "start_datetime": target_slot_2['start_datetime'],
        "end_datetime": target_slot_2['end_datetime'],
        "patient_name": "QA Concurrency",
        "patient_email": "qaconc@example.com",
        "patient_phone": "1234567890"
    }
    
    Appointment.objects.filter(doctor=doctor, start_datetime=target_slot_2['start_datetime']).delete()

    results = []
    def make_request():
        res = requests.post(f"{base_url}/booking/create_appointment/", json=payload_2)
        results.append(res.status_code)

    t1 = Thread(target=make_request)
    t2 = Thread(target=make_request)
    
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    print(f"Concurrency Results (Statuses): {results}")

    print("\n--- PART 5: SYSTEM BREAK TEST ---")
    res = requests.post(f"{base_url}/booking/create_appointment/", data="this is not json")
    print(f"POST Booking (Malformed JSON): {res.status_code}")
    
    print("\nQA Testing Complete.")

if __name__ == '__main__':
    run_tests()
