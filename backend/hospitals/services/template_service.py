from hospitals.models import Page, Block


def generate_default_hospital_template(website_setup):
    """
    Generates hardcoded templates (Pages and Blocks) for a new Hospital Profile.
    """
    # Create Home Page
    home_page = Page.objects.create(
        website_setup=website_setup,
        title="Home",
        slug="home",
        is_published=True,
        is_home=True
    )

    # Hero Block
    Block.objects.create(
        page=home_page,
        type=Block.BlockType.HERO_BLOCK,
        order=1,
        settings={
            "headline"             : "Your Health, Our Priority",
            "subheadline"          : "Experience world-class medical care with modern facilities and compassionate specialists.",
            "badge_text"           : "Premium Healthcare",
            "button_text"          : "Book an Appointment",
            "button_link"          : "/booking",
            "secondary_button_text": "Meet Our Doctors",
            "secondary_button_link": "/#doctors"
        }
    )

    # Departments Block
    Block.objects.create(
        page=home_page,
        type=Block.BlockType.DEPARTMENTS_BLOCK,
        order=2,
        settings={
            "title": "Our Departments",
            "show_count": 6
        }
    )

    # Doctors Block
    Block.objects.create(
        page=home_page,
        type=Block.BlockType.DOCTORS_LIST_BLOCK,
        order=3,
        settings={
            "title": "Meet Our Doctors",
            "show_count": 4
        }
    )

    # Contact Block
    Block.objects.create(
        page=home_page,
        type=Block.BlockType.CONTACT_BLOCK,
        order=4,
        settings={
            "phone": "+1-800-MEDIFY",
            "email": "care@medify.com",
            "address": "123 Health Ave, Medical District"
        }
    )

    # Booking Page
    booking_page = Page.objects.create(
        website_setup=website_setup,
        title="Book Appointment",
        slug="booking",
        is_published=True,
        is_home=False
    )

    # Booking Form Block
    Block.objects.create(
        page=booking_page,
        type=Block.BlockType.BOOKING_FORM_BLOCK,
        order=1,
        settings={
            "title": "Schedule a Visit",
            "success_message": "Your appointment has been successfully requested."
        }
    )

    return [home_page, booking_page]
