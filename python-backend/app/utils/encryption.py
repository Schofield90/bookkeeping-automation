"""
Encryption utilities for sensitive data (Xero tokens)
"""

import logging
from cryptography.fernet import Fernet
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EncryptionService:
    """Handle encryption/decryption of sensitive data"""

    def __init__(self):
        # In production, this should be from settings and properly managed
        # For now, we'll use the encryption_key from settings
        self.cipher_suite = Fernet(settings.encryption_key.encode())

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a string"""
        try:
            encrypted_bytes = self.cipher_suite.encrypt(plaintext.encode())
            return encrypted_bytes.decode()
        except Exception as e:
            logger.error(f"Encryption error: {e}")
            raise

    def decrypt(self, encrypted_text: str) -> str:
        """Decrypt a string"""
        try:
            decrypted_bytes = self.cipher_suite.decrypt(encrypted_text.encode())
            return decrypted_bytes.decode()
        except Exception as e:
            logger.error(f"Decryption error: {e}")
            raise


# Singleton
_encryption_service = None


def get_encryption_service() -> EncryptionService:
    """Get or create encryption service"""
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service
