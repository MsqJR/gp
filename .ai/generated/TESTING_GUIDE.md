# Testing Guide: CSV Product Import

## Prerequisites

1. Backend server running: `python manage.py runserver`
2. Frontend server running: `npm run dev`
3. User logged in to dashboard

## Step-by-Step Testing

### 1. Clean Database (if needed)

```bash
cd graduation/backend
python manage.py cleanup_products --delete-all
```

### 2. Prepare Test CSV

Use the sample file at `/sample-pharmacy-products.csv` or create your own:

```csv
Product Name,Category,Price,Stock Quantity,Description,Image
Test Product 1,Pain Relief,9.99,25,Test description,https://placehold.co/600x400/png?text=Product+1
Test Product 2,Vitamins,15.50,50,Another test,
```

**Important**:
- Required columns are `Product Name`, `Category`, `Price`, `Stock Quantity`, and `Description`.
- Optional image aliases are `Image`, `image_url`, and `Image Link`.
- Invalid image URLs do not fail the row; the row imports with image cleared.

### 3. Upload CSV

1. Navigate to: `http://localhost:3000/dashboard/pharmacy/products`
2. Upload the CSV file in the "CSV Upload" section
3. Select your CSV file
4. Click "Upload CSV"

### 4. Verify Backend Received Data

Check Django console/logs for:
```
First product data: {'name': '...', 'stock': 25, ...}
```

### 5. Check Database

```bash
python manage.py shell
```

```python
from pharmacies.models import Product
products = Product.objects.all()
for p in products:
    print(f"{p.name}: stock={p.stock}, in_stock={p.in_stock}")
```

Expected output:
```
Test Product 1: stock=25, in_stock=True
Test Product 2: stock=50, in_stock=True
```

### 6. View on Frontend

Navigate to: `http://localhost:3000/templates/pharmacy/3/medications`

You can also validate the added templates:
- `http://localhost:3000/templates/pharmacy/4/medications`
- `http://localhost:3000/templates/pharmacy/5/medications`
- `http://localhost:3000/templates/pharmacy/6/medications`

Expected:
- Products display with correct stock numbers
- Stock badges show "In Stock" (green) for stock > 5
- Stock badges show "Low Stock" (orange) for stock 1-4
- Stock badges show "Out of Stock" (red) for stock = 0
- Products with valid image URLs display images
- Products with blank or invalid image URLs show template fallback image UI

## Common Issues & Solutions

### Issue 1: Stock shows 0 after upload

**Diagnosis**:
- Check browser console logs during CSV parse
- Check Django logs for received data
- Verify CSV file has stock column with numeric values

**Solution**:
- Ensure CSV has no extra spaces: `25` not ` 25 `
- Ensure stock column exists (for example: `Stock Quantity`)
- Check CSV encoding (should be UTF-8)

### Issue 1b: Product image not shown

**Diagnosis**:
- Check image column values start with `http://` or `https://`
- Confirm the header uses one of: `Image`, `image_url`, `Image Link`

**Solution**:
- Use a valid absolute URL
- Re-upload CSV; invalid image values are ignored, but the rest of the row still imports

### Issue 2: Products not persisting

**Diagnosis**:
- Check if user is authenticated (access_token in localStorage)
- Check Django logs for errors
- Verify database connection

**Solution**:
- Re-login to get fresh token
- Check backend server is running
- Run migrations: `python manage.py migrate`

### Issue 3: Duplicate products

**Diagnosis**:
- Check if same CSV uploaded multiple times
- Products with same name+category create duplicates

**Solution**:
```bash
python manage.py cleanup_products --remove-duplicates
```

## Debug Commands

### View all products in database
```bash
python manage.py shell -c "from pharmacies.models import Product; [print(f'{p.name}: {p.stock}') for p in Product.objects.all()[:10]]"
```

### Count products
```bash
python manage.py shell -c "from pharmacies.models import Product; print(Product.objects.count())"
```

### Delete all products
```bash
python manage.py cleanup_products --delete-all
```

### Remove duplicates only
```bash
python manage.py cleanup_products --remove-duplicates
```

## API Testing with curl

### Upload products directly
```bash
curl -X POST http://localhost:8000/api/pharmacy/products/bulk_upload/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {
        "name": "Test Product",
        "category": "Test",
        "description": "Test desc",
        "price": 9.99,
        "stock": 25
      }
    ]
  }'
```

### Get all products
```bash
curl -X GET http://localhost:8000/api/pharmacy/products/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Expected Behavior

✅ CSV upload creates products with correct stock  
✅ Products persist after page reload  
✅ Re-uploading same CSV updates existing products  
✅ Stock badges display correct status  
✅ "Add to Cart" disabled when stock = 0  
✅ Cannot add more than available stock to cart  
✅ Invalid image URLs are ignored without failing otherwise valid rows  

## Troubleshooting Checklist

- [ ] Backend server running on port 8000
- [ ] Frontend server running on port 3000
- [ ] User logged in with valid token
- [ ] CSV file properly formatted
- [ ] Stock column has numeric values
- [ ] Optional image values (if provided) are valid `http/https` URLs
- [ ] No extra spaces in CSV
- [ ] Database migrations applied
- [ ] Browser console shows no errors
- [ ] Django logs show no errors
