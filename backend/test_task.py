import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'medify_backend.settings')
django.setup()

from hospitals.tasks import send_review_emails
from hospitals.models import Appointment, Doctor, Department
from core.models import WebsiteSetup, User
from django.utils import timezone
from datetime import timedelta

if __name__ == '__main__':
    print("Setting up test appointment...")
    # Ensure a completed appointment exactly 24 hours ago
    user, _ = User.objects.get_or_create(email="testtask@example.com")
    ws, _ = WebsiteSetup.objects.get_or_create(user=user, subdomain="testtask")
    department, _ = Department.objects.get_or_create(website_setup=ws, name="Task Department")
    doctor, _ = Doctor.objects.get_or_create(website_setup=ws, department=department, name="Dr. Task")

    appointment = Appointment.objects.create(
        doctor=doctor,
        website_setup=ws,
        patient_name="Task Patient",
        patient_email="taskpatient@example.com",
        start_datetime=timezone.now() - timedelta(hours=25),
        end_datetime=timezone.now() - timedelta(hours=24),
        status=Appointment.Status.PENDING
    )

    print("Confirming appointment (Should trigger immediate email sending)...")
    appointment.status = Appointment.Status.CONFIRMED
    appointment.save()

    # Verify that the review email and confirmation email were sent immediately
    appointment.refresh_from_db()
    print(f"review_email_sent is: {appointment.review_email_sent} (Should be True)")
    print(f"confirmation_email_sent is: {appointment.confirmation_email_sent} (Should be True)")

    print("Running send_review_emails (Should skip due to review_email_sent)...")
    send_review_emails()


    print("Cleanup...")
    appointment.delete()
    doctor.delete()
    department.delete()
    ws.delete()
    user.delete()
    print("Done.")
