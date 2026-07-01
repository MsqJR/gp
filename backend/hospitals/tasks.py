from datetime import timedelta
import logging
from django.utils import timezone
from django.core.mail import send_mail
from django.core.signing import TimestampSigner
from django.conf import settings
from .models import Appointment

logger = logging.getLogger(__name__)

def send_individual_review_email(appointment_id):
    """
    Sends a review email to the patient of the given appointment ID.
    """
    try:
        appointment = Appointment.objects.get(id=appointment_id)
    except Appointment.DoesNotExist:
        logger.error(f"Cannot send review email: Appointment {appointment_id} does not exist.")
        return False

    # Only send review emails if the website owner has the Premium Plan (review_system feature enabled)
    from core.services.subscription import has_feature_access
    if not has_feature_access(appointment.website_setup, 'review_system'):
        logger.info(f"Skipping review email for appointment {appointment.id}: website setup does not have review_system permission.")
        return False

    if appointment.review_email_sent:
        return False

    # Check if review already exists just in case
    if hasattr(appointment, 'review'):
        appointment.review_email_sent = True
        appointment.save(update_fields=['review_email_sent'])
        return False

    if not appointment.patient_email:
        return False

    signer = TimestampSigner()
    token = signer.sign(str(appointment.id))
    
    # Use root domain since review page is global
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    review_link = f"{frontend_url}/review/{token}"
    
    doctor_name = appointment.doctor.name
    hospital_name = appointment.website_setup.business_info.name if hasattr(appointment.website_setup, 'business_info') else 'our hospital'
    
    subject = f"How was your visit with {doctor_name}?"
    message = (
        f"Dear {appointment.patient_name},\n\n"
        f"We hope you had a good visit with {doctor_name} at {hospital_name}.\n\n"
        f"Please take a moment to leave a review of your experience:\n"
        f"{review_link}\n\n"
        f"Thank you,\n"
        f"{hospital_name}"
    )
    
    try:
        send_mail(
            subject,
            message,
            getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@medify.local'),
            [appointment.patient_email],
            fail_silently=False,
        )
        
        appointment.review_email_sent = True
        appointment.save(update_fields=['review_email_sent'])
        logger.info(f"Successfully sent review email to {appointment.patient_email} for appointment {appointment.id}")
        return True
    except Exception as e:
        logger.error(f"Failed to send review email for appointment {appointment.id}: {str(e)}")
        return False


def send_appointment_confirmation_email(appointment_id):
    """
    Sends an appointment confirmation email to the patient.
    """
    try:
        appointment = Appointment.objects.get(id=appointment_id)
    except Appointment.DoesNotExist:
        logger.error(f"Cannot send confirmation email: Appointment {appointment_id} does not exist.")
        return False

    if appointment.confirmation_email_sent:
        return False

    if not appointment.patient_email:
        return False

    doctor_name = appointment.doctor.name
    department_name = appointment.doctor.department.name if appointment.doctor.department else 'N/A'
    hospital_name = appointment.website_setup.business_info.name if hasattr(appointment.website_setup, 'business_info') else 'our hospital'
    
    # Format date and time in the local timezone of start_datetime
    local_start = timezone.localtime(appointment.start_datetime)
    appointment_date = local_start.strftime('%Y-%m-%d')
    appointment_time = local_start.strftime('%I:%M %p')

    # Avoid duplicate "Dr." prefix if the doctor's name already starts with it
    if doctor_name.lower().startswith(('dr.', 'dr ')):
        display_doctor = doctor_name
    else:
        display_doctor = f"Dr. {doctor_name}"

    subject = f"Appointment Confirmed - {hospital_name}"
    message = (
        f"Dear {appointment.patient_name},\n\n"
        f"Thank you for choosing {hospital_name}.\n\n"
        f"Your appointment has been successfully confirmed. Below are your reservation details:\n\n"
        f"Reservation ID: {appointment.id}\n"
        f"Doctor: {display_doctor}\n"
        f"Department: {department_name}\n"
        f"Date: {appointment_date}\n"
        f"Time: {appointment_time}\n\n"
        f"Please arrive 10–15 minutes before your scheduled appointment and bring any required medical documents or identification.\n\n"
        f"If you need to reschedule or cancel your appointment, please contact us as soon as possible.\n\n"
        f"We look forward to seeing you and wish you good health.\n\n"
        f"Best regards,\n\n"
        f"{hospital_name}\n"
        f"Medify Support"
    )

    try:
        send_mail(
            subject,
            message,
            getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@medify.local'),
            [appointment.patient_email],
            fail_silently=False,
        )
        
        appointment.confirmation_email_sent = True
        appointment.save(update_fields=['confirmation_email_sent'])
        logger.info(f"Successfully sent confirmation email to {appointment.patient_email} for appointment {appointment.id}")
        return True
    except Exception as e:
        logger.error(f"Failed to send confirmation email for appointment {appointment.id}: {str(e)}")
        return False


def send_review_emails():
    """
    Finds appointments that were completed and sends a review email to the patient.
    """
    logger.info("Running send_review_emails job")
    
    appointments = Appointment.objects.filter(
        status__in=[Appointment.Status.CONFIRMED, 'COMPLETED'],
        review_email_sent=False
    ).exclude(patient_email="")
    
    for appointment in appointments:
        send_individual_review_email(appointment.id)

