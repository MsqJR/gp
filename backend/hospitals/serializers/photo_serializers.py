from rest_framework import serializers
from ..models import HospitalPhoto


class HospitalPhotoSerializer(serializers.ModelSerializer):
    """Serializer for hospital photos."""
    
    class Meta:
        model = HospitalPhoto
        fields = [
            'id', 'image', 'image_url', 'alt_text', 'caption', 
            'display_order', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def to_representation(self, instance):
        """Customize the representation to include full image URLs."""
        representation = super().to_representation(instance)
        
        # If we have an image file, provide the full URL
        if instance.image and hasattr(instance.image, 'url'):
            try:
                representation['image_url'] = self.context['request'].build_absolute_uri(instance.image.url)
            except Exception:
                # Fallback to the stored image_url if available
                if instance.image_url:
                    representation['image_url'] = instance.image_url
        elif instance.image_url:
            representation['image_url'] = instance.image_url
            
        return representation


class HospitalPhotoUpdateOrderSerializer(serializers.Serializer):
    """Serializer for bulk updating photo display order."""
    
    photo_ids = serializers.ListField(
        child=serializers.UUIDField(),
        help_text="List of photo IDs in the desired display order"
    )
    
    def validate_photo_ids(self, value):
        """Validate that all photo IDs exist and belong to the user's hospital."""
        if not value:
            raise serializers.ValidationError("Photo IDs list cannot be empty")
            
        # This validation will be completed in the view where we have access to the request user
        return value