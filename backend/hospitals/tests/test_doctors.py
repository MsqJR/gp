"""
Tests for Doctor admin CRUD persistence.
"""
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.test import TestCase

from core.models import User, WebsiteSetup
from hospitals.models import HospitalProfile, Department, Doctor


def get_jwt(user):
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


class DoctorCrudTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='docadmin',
            email='docadmin@example.com',
            password='testpass123',
            name='Doc Admin',
            business_type='hospital',
        )
        self.website_setup = WebsiteSetup.objects.create(
            user=self.user,
            subdomain='doc-hospital',
        )
        HospitalProfile.objects.create(
            website_setup=self.website_setup,
            name='Doc Hospital',
        )
        self.department = Department.objects.create(
            website_setup=self.website_setup,
            name='Cardiology',
        )
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {get_jwt(self.user)}')
        self.list_url = '/api/hospital/admin/doctors/'

    def test_create_doctor_persists_to_database(self):
        payload = {
            'name': 'Dr. Jane Doe',
            'title': 'Consultant Cardiologist',
            'specialty': 'Cardiology',
            'experience': '12 years',
            'bio': 'Expert in heart care.',
            'department': str(self.department.id),
            'email': 'jane@hospital.com',
            'age': 42,
            'gender': 'Female',
            'is_active': True,
        }

        response = self.client.post(self.list_url, payload, format='json')
        self.assertEqual(response.status_code, 201, response.content)

        doctor_id = response.data['id']
        self.assertTrue(Doctor.objects.filter(id=doctor_id).exists())

        persisted = Doctor.objects.get(id=doctor_id)
        self.assertEqual(persisted.name, 'Dr. Jane Doe')
        self.assertEqual(persisted.title, 'Consultant Cardiologist')
        self.assertEqual(persisted.experience, '12 years')
        self.assertEqual(persisted.email, 'jane@hospital.com')
        self.assertEqual(persisted.age, 42)
        self.assertEqual(persisted.gender, 'Female')

        list_response = self.client.get(self.list_url)
        self.assertEqual(list_response.status_code, 200)
        results = list_response.data.get('results', list_response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['name'], 'Dr. Jane Doe')

    def test_update_doctor_persists_changes(self):
        doctor = Doctor.objects.create(
            website_setup=self.website_setup,
            department=self.department,
            name='Dr. Old Name',
            specialty='Cardiology',
        )
        detail_url = f'{self.list_url}{doctor.id}/'

        response = self.client.patch(detail_url, {
            'name': 'Dr. New Name',
            'title': 'Senior Consultant',
            'experience': '20 years',
            'email': 'new@hospital.com',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)

        doctor.refresh_from_db()
        self.assertEqual(doctor.name, 'Dr. New Name')
        self.assertEqual(doctor.title, 'Senior Consultant')
        self.assertEqual(doctor.experience, '20 years')
        self.assertEqual(doctor.email, 'new@hospital.com')

    def test_delete_doctor_removes_record(self):
        doctor = Doctor.objects.create(
            website_setup=self.website_setup,
            department=self.department,
            name='Dr. To Delete',
            specialty='Cardiology',
        )
        detail_url = f'{self.list_url}{doctor.id}/'

        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Doctor.objects.filter(id=doctor.id).exists())

        list_response = self.client.get(self.list_url)
        results = list_response.data.get('results', list_response.data)
        self.assertEqual(len(results), 0)

    def test_cannot_use_department_from_other_hospital(self):
        other_user = User.objects.create_user(
            username='otherdoc',
            email='otherdoc@example.com',
            password='testpass123',
            name='Other Admin',
            business_type='hospital',
        )
        other_setup = WebsiteSetup.objects.create(user=other_user, subdomain='other-doc-hospital')
        other_dept = Department.objects.create(website_setup=other_setup, name='Neurology')

        response = self.client.post(self.list_url, {
            'name': 'Dr. Cross Tenant',
            'specialty': 'Neurology',
            'department': str(other_dept.id),
        }, format='json')
        self.assertEqual(response.status_code, 400)
