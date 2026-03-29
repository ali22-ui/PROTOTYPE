#!/usr/bin/env python
"""Test script to verify imports and config."""

import sys
import traceback

def test_config():
    """Test config import."""
    try:
        from app.core.config import get_settings
        s = get_settings()
        print('✓ Config OK')
        print(f'  ip_webcam_enabled: {s.ip_webcam_enabled}')
        print(f'  ip_webcam_base_url: {s.ip_webcam_base_url}')
        return True
    except Exception as e:
        print('✗ Config FAILED')
        traceback.print_exc()
        return False

def test_ip_camera_service():
    """Test IP camera service import."""
    try:
        from app.services.ip_camera_service import get_ip_camera_service
        print('✓ IP Camera Service OK')
        return True
    except Exception as e:
        print('✗ IP Camera Service FAILED')
        traceback.print_exc()
        return False

def test_camera_service():
    """Test camera service functions import."""
    try:
        from app.services.camera_service import get_camera_source, set_camera_source, stream_camera_relay
        print('✓ Camera Service functions OK')
        return True
    except Exception as e:
        print('✗ Camera Service FAILED')
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print('Running import tests...\n')
    results = [
        test_config(),
        test_ip_camera_service(),
        test_camera_service(),
    ]
    print(f'\n{"="*50}')
    print(f'Results: {sum(results)}/{len(results)} tests passed')
    sys.exit(0 if all(results) else 1)
