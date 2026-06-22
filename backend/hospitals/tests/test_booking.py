import datetime
from django.test import TestCase
from django.utils import timezone
from core.models import User, WebsiteSetup
from hospitals.models import HospitalProfile, Department, Doctor, DoctorSchedule, Appointment
from hospitals.services.booking_engine import get_available_slots


class HospitalModuleTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testadmin',
            email='testadmin@example.com',
            password='testpassword123',
            name='Test Admin'
        )
        self.website_setup = WebsiteSetup.objects.create(
            user=self.user,
            subdomain='test-hospital'
        )
        self.profile = HospitalProfile.objects.create(
            website_setup=self.website_setup,
            name='Test Hospital'
        )
        self.department = Department.objects.create(
            website_setup=self.website_setup,
            name='Cardiology'
        )
        self.doctor = Doctor.objects.create(
            website_setup=self.website_setup,
            department=self.department,
            name='Dr. Smith',
            specialty='Cardiologist'
        )

        self.test_date = datetime.date(2025, 1, 6)

        DoctorSchedule.objects.create(
            doctor=self.doctor,
            day_of_week=0,
            start_time=datetime.time(9, 0),
            end_time=datetime.time(11, 0),
            slot_duration_minutes=30
        )

    def test_1_slot_generation(self):
        slots = get_available_slots(self.doctor, self.test_date)

        self.assertEqual(len(slots), 4)

        first_slot = slots[0]
        self.assertEqual(first_slot['start_datetime'].time(), datetime.time(9, 0))
        self.assertEqual(first_slot['end_datetime'].time(), datetime.time(9, 30))

        last_slot = slots[-1]
        self.assertEqual(last_slot['start_datetime'].time(), datetime.time(10, 30))
        self.assertEqual(last_slot['end_datetime'].time(), datetime.time(11, 0))

    def test_2_booking_and_slot_reduction(self):
        start_dt = timezone.make_aware(datetime.datetime.combine(self.test_date, datetime.time(9, 0)))
        end_dt = timezone.make_aware(datetime.datetime.combine(self.test_date, datetime.time(9, 30)))

        Appointment.objects.create(
            website_setup=self.website_setup,
            doctor=self.doctor,
            patient_name='John Doe',
            patient_email='john@example.com',
            patient_phone='1234567890',
            start_datetime=start_dt,
            end_datetime=end_dt
        )

        slots = get_available_slots(self.doctor, self.test_date)
        self.assertEqual(len(slots), 3)
        self.assertEqual(slots[0]['start_datetime'].time(), datetime.time(9, 30))

    def test_3_double_booking_prevention(self):
        start_dt = timezone.make_aware(datetime.datetime.combine(self.test_date, datetime.time(9, 0)))
        end_dt = timezone.make_aware(datetime.datetime.combine(self.test_date, datetime.time(9, 30)))

        Appointment.objects.create(
            website_setup=self.website_setup,
            doctor=self.doctor,
            patient_name='John Doe',
            patient_email='john@example.com',
            patient_phone='1234567890',
            start_datetime=start_dt,
            end_datetime=end_dt
        )

        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            Appointment.objects.create(
                website_setup=self.website_setup,
                doctor=self.doctor,
                patient_name='Jane Smith',
                patient_email='jane@example.com',
                patient_phone='0987654321',
                start_datetime=start_dt,
                end_datetime=end_dt
            )

    def test_4_schedule_conflict(self):
        tuesday_date = datetime.date(2025, 1, 7)
        slots = get_available_slots(self.doctor, tuesday_date)
        self.assertEqual(len(slots), 0)

    def test_5_multi_slot_day(self):
        DoctorSchedule.objects.create(
            doctor=self.doctor,
            day_of_week=0,
            start_time=datetime.time(14, 0),
            end_time=datetime.time(15, 0),
            slot_duration_minutes=30
        )

        slots = get_available_slots(self.doctor, self.test_date)

        self.assertEqual(len(slots), 6)

        self.assertEqual(slots[4]['start_datetime'].time(), datetime.time(14, 0))

    def test_6_concurrency_booking(self):
        from rest_framework.test import APIClient
        from django.urls import reverse

        client1 = APIClient()
        client2 = APIClient()

        url = reverse('hospital-booking-create-appointment')

        start_dt = timezone.make_aware(datetime.datetime.combine(self.test_date, datetime.time(9, 0)))
        end_dt = timezone.make_aware(datetime.datetime.combine(self.test_date, datetime.time(9, 30)))

        payload1 = {
            'doctor_id': self.doctor.id,
            'start_datetime': start_dt.isoformat(),
            'end_datetime': end_dt.isoformat(),
            'patient_name': 'Thread 1',
            'patient_email': 't1@test.com',
            'patient_phone': '1'
        }

        payload2 = {
            'doctor_id': self.doctor.id,
            'start_datetime': start_dt.isoformat(),
            'end_datetime': end_dt.isoformat(),
            'patient_name': 'Thread 2',
            'patient_email': 't2@test.com',
            'patient_phone': '2'
        }

        res1 = client1.post(url, payload1, format='json')
        self.assertEqual(res1.status_code, 201)

        res2 = client2.post(url, payload2, format='json')
        self.assertEqual(res2.status_code, 409)
