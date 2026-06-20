import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'medify_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from pharmacies.models import Product
from core.models import WebsiteSetup

User = get_user_model()

def main():
    # Get or create a test user
    user, created = User.objects.get_or_create(
        email='test@pharmacy.com',
        defaults={
            'username': 'test@pharmacy.com',
            'name': 'Test Pharmacy User',
            'business_type': 'pharmacy',
            'is_active': True,
        },
    )

    if created:
        user.set_password('test123')
        user.save()
        print(f"Created test user: {user.email}")
    else:
        print(f"Using existing user: {user.email}")

    # Get or create website setup
    website_setup, _ = WebsiteSetup.objects.get_or_create(
        user=user,
        defaults={'subdomain': 'testpharmacy'},
    )

    # Test product data (simulating CSV import)
    test_products = [
        {
            'name': 'Amoxicillin 500mg Capsules',
            'category': 'Antibiotic',
            'description': 'Antibiotic for bacterial infections',
            'price': 35.00,
            'stock': 50,
        },
        {
            'name': 'Paracetamol 500mg Tablets',
            'category': 'Pain Relief',
            'description': 'Pain and fever relief medication',
            'price': 4.99,
            'stock': 100,
        },
    ]

    print("\nCreating test products...")
    for product_data in test_products:
        product = Product.objects.create(
            website_setup=website_setup,
            **product_data,
        )
        print(f"Created: {product.name} - Stock: {product.stock}, In Stock: {product.in_stock}")

    # Verify
    print(f"\nTotal products in database: {Product.objects.count()}")
    products = Product.objects.filter(website_setup=website_setup)
    for product in products:
        print(
            f"  {product.name}: stock={product.stock}, in_stock={product.in_stock}, price={product.price}",
        )


if __name__ == '__main__':
    main()
