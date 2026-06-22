from datetime import datetime, timedelta, date, time
from django.utils import timezone
from hospitals.models import DoctorSchedule, Appointment


def get_available_slots(doctor, target_date: date):
    """
    Computes available slots dynamically for a given doctor and date.
    Returns a list of dicts: [{'start_datetime': datetime, 'end_datetime': datetime}]
    """
    # 0 = Monday, ..., 6 = Sunday
    day_of_week = target_date.weekday()

    # Get schedules - prioritize specific_date if set, otherwise use day_of_week
    schedules = DoctorSchedule.objects.filter(
        doctor=doctor,
        specific_date=target_date
    )

    # If no specific date schedule found, fall back to day_of_week schedules (for backward compatibility)
    if not schedules.exists():
        schedules = DoctorSchedule.objects.filter(
            doctor=doctor,
            day_of_week=day_of_week,
            specific_date__isnull=True
        )

    if not schedules.exists():
        return []

    # Get existing appointments for the doctor on this date
    # Convert target_date to a datetime range in the current timezone or UTC
    # Since dates are given, we compare start_datetime.date() conceptually
    start_of_day = timezone.make_aware(datetime.combine(target_date, time.min))
    end_of_day = timezone.make_aware(datetime.combine(target_date, time.max))

    appointments = Appointment.objects.filter(
        doctor=doctor,
        start_datetime__gte=start_of_day,
        start_datetime__lte=end_of_day,
        status__in=[Appointment.Status.PENDING, Appointment.Status.CONFIRMED]
    )

    available_slots = []

    for schedule in schedules:
        # Generate all possible slots for this schedule
        current_time = datetime.combine(target_date, schedule.start_time)
        end_time = datetime.combine(target_date, schedule.end_time)

        # Make them aware based on standard django timezone (or hospital profile timezone if needed)
        # For simplicity in Phase 1, we assume UTC everywhere if not specified otherwise
        current_time = timezone.make_aware(current_time)
        end_time = timezone.make_aware(end_time)

        slot_duration = timedelta(minutes=schedule.slot_duration_minutes)

        while current_time + slot_duration <= end_time:
            slot_start = current_time
            slot_end = current_time + slot_duration

            # Explicitly check for overlap with existing appointments
            # existing.start < new_end AND existing.end > new_start
            overlap = False
            for appt in appointments:
                if appt.start_datetime < slot_end and appt.end_datetime > slot_start:
                    overlap = True
                    break

            if not overlap:
                available_slots.append({
                    'start_datetime': slot_start,
                    'end_datetime': slot_end
                })

            current_time = slot_end

    return available_slots
