"""
Xero OAuth Authorization Service
Handles OAuth 2.0 flow and token management
"""

import logging
from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timedelta

from xero_python.api_client import ApiClient
from xero_python.api_client.configuration import Configuration
from xero_python.api_client.oauth2 import OAuth2Token
from xero_python.accounting import AccountingApi
from xero_python.exceptions import AccountingBadRequestException

from app.config import get_settings
from app.utils.supabase_client import get_supabase_client
from app.utils.encryption import get_encryption_service
from app.models import ChartOfAccountsItem

logger = logging.getLogger(__name__)
settings = get_settings()


class XeroAuthService:
    """
    Manages Xero OAuth 2.0 authorization flow and token refresh

    Flow:
    1. /xero/connect - Generates authorization URL
    2. User authorizes on Xero's site
    3. /xero/callback - Receives code, exchanges for tokens
    4. Tokens stored encrypted in database
    5. Auto-refresh before expiry
    """

    def __init__(self):
        self.supabase = get_supabase_client()
        self.encryption = get_encryption_service()

        # Xero API configuration
        self.config = Configuration()
        self.config.client_id = settings.xero_client_id
        self.config.client_secret = settings.xero_client_secret

    def get_authorization_url(self, state: str) -> str:
        """
        Generate Xero authorization URL for OAuth flow

        Args:
            state: A random string to prevent CSRF attacks

        Returns:
            Authorization URL to redirect user to
        """

        api_client = ApiClient(
            self.config,
            oauth2_token=OAuth2Token()
        )

        # Xero scopes needed
        scopes = [
            "offline_access",  # For refresh token
            "accounting.transactions",
            "accounting.settings",
            "accounting.contacts"
        ]

        authorization_url = api_client.get_authorization_url(
            redirect_uri=settings.xero_redirect_uri,
            scope=" ".join(scopes),
            state=state
        )

        return authorization_url

    async def handle_callback(
        self,
        code: str,
        organization_id: UUID
    ) -> Dict[str, Any]:
        """
        Handle OAuth callback after user authorizes

        Args:
            code: Authorization code from Xero
            organization_id: The organization to link

        Returns:
            Dict with success status and Xero connection info
        """

        try:
            # Exchange code for tokens
            api_client = ApiClient(
                self.config,
                oauth2_token=OAuth2Token()
            )

            # Get token
            token = api_client.get_oauth2_token(
                code=code,
                redirect_uri=settings.xero_redirect_uri
            )

            # Get Xero tenant (organization) ID
            connections = api_client.get_connections()
            if not connections or len(connections) == 0:
                raise Exception("No Xero organization connected")

            xero_tenant_id = connections[0]['tenantId']
            xero_org_name = connections[0]['tenantName']
            xero_org_type = connections[0].get('tenantType', 'COMPANY')

            # Encrypt tokens before storing
            encrypted_access_token = self.encryption.encrypt(token.access_token)
            encrypted_refresh_token = self.encryption.encrypt(token.refresh_token)

            # Calculate expiry
            token_expires_at = datetime.utcnow() + timedelta(seconds=token.expires_in)

            # Store in database
            xero_config_data = {
                'organization_id': str(organization_id),
                'xero_tenant_id': xero_tenant_id,
                'encrypted_access_token': encrypted_access_token,
                'encrypted_refresh_token': encrypted_refresh_token,
                'token_expires_at': token_expires_at.isoformat(),
                'xero_org_name': xero_org_name,
                'xero_org_type': xero_org_type,
                'sync_status': 'connected',
                'auto_sync_enabled': False
            }

            # Check if config exists
            existing_config = await self.supabase.get_xero_config(organization_id)

            if existing_config:
                # Update existing
                await self.supabase.update_xero_config(organization_id, xero_config_data)
            else:
                # Insert new
                self.supabase.get_client().table('bookkeeping_xero_configs').insert(xero_config_data).execute()

            # Fetch and cache Chart of Accounts
            await self._fetch_and_cache_chart_of_accounts(
                organization_id,
                token.access_token,
                xero_tenant_id
            )

            logger.info(f"Xero connected successfully for org {organization_id}")

            return {
                'success': True,
                'xero_org_name': xero_org_name,
                'xero_tenant_id': xero_tenant_id
            }

        except Exception as e:
            logger.error(f"Error handling Xero callback: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    async def get_valid_access_token(self, organization_id: UUID) -> Optional[str]:
        """
        Get a valid access token for Xero API calls

        Automatically refreshes if expired

        Returns:
            Valid access token or None if not connected
        """

        try:
            xero_config = await self.supabase.get_xero_config(organization_id)

            if not xero_config:
                logger.warning(f"No Xero config found for org {organization_id}")
                return None

            # Check if token is expired or about to expire (within 5 minutes)
            token_expires_at = datetime.fromisoformat(xero_config['token_expires_at'].replace('Z', '+00:00'))
            now = datetime.utcnow()

            if now >= token_expires_at - timedelta(minutes=5):
                # Token expired or about to expire, refresh it
                logger.info(f"Refreshing Xero token for org {organization_id}")
                return await self._refresh_token(organization_id, xero_config)

            # Token is still valid, decrypt and return
            encrypted_token = xero_config['encrypted_access_token']
            access_token = self.encryption.decrypt(encrypted_token)

            return access_token

        except Exception as e:
            logger.error(f"Error getting valid access token: {e}")
            return None

    async def _refresh_token(
        self,
        organization_id: UUID,
        xero_config: Dict[str, Any]
    ) -> Optional[str]:
        """
        Refresh the Xero access token using refresh token

        This is called automatically when token expires
        """

        try:
            # Decrypt refresh token
            encrypted_refresh_token = xero_config['encrypted_refresh_token']
            refresh_token = self.encryption.decrypt(encrypted_refresh_token)

            # Create API client
            api_client = ApiClient(
                self.config,
                oauth2_token=OAuth2Token(refresh_token=refresh_token)
            )

            # Refresh the token
            new_token = api_client.refresh_oauth2_token()

            # Encrypt new tokens
            encrypted_access_token = self.encryption.encrypt(new_token.access_token)
            encrypted_refresh_token = self.encryption.encrypt(new_token.refresh_token)

            # Calculate new expiry
            token_expires_at = datetime.utcnow() + timedelta(seconds=new_token.expires_in)

            # Update database
            await self.supabase.update_xero_config(organization_id, {
                'encrypted_access_token': encrypted_access_token,
                'encrypted_refresh_token': encrypted_refresh_token,
                'token_expires_at': token_expires_at.isoformat(),
                'sync_status': 'connected'
            })

            logger.info(f"Xero token refreshed successfully for org {organization_id}")

            return new_token.access_token

        except Exception as e:
            logger.error(f"Error refreshing Xero token: {e}")

            # Mark as error in database
            await self.supabase.update_xero_config(organization_id, {
                'sync_status': 'error',
                'sync_error_message': f"Token refresh failed: {str(e)}"
            })

            return None

    async def _fetch_and_cache_chart_of_accounts(
        self,
        organization_id: UUID,
        access_token: str,
        xero_tenant_id: str
    ):
        """
        Fetch Chart of Accounts from Xero and cache in database

        This reduces API calls during categorization
        """

        try:
            # Create API client
            api_client = ApiClient(
                self.config,
                oauth2_token=OAuth2Token(access_token=access_token)
            )

            # Get accounting API
            accounting_api = AccountingApi(api_client)

            # Fetch Chart of Accounts
            accounts = accounting_api.get_accounts(xero_tenant_id)

            # Transform to our format
            chart_of_accounts = []
            for account in accounts.accounts:
                chart_of_accounts.append({
                    'code': account.code,
                    'name': account.name,
                    'type': account.type,
                    'description': account.description
                })

            # Cache in database
            await self.supabase.update_xero_config(organization_id, {
                'chart_of_accounts': chart_of_accounts,
                'chart_of_accounts_updated_at': datetime.utcnow().isoformat()
            })

            logger.info(f"Cached {len(chart_of_accounts)} accounts for org {organization_id}")

        except Exception as e:
            logger.error(f"Error fetching chart of accounts: {e}")

    async def get_chart_of_accounts(
        self,
        organization_id: UUID
    ) -> list[ChartOfAccountsItem]:
        """
        Get Chart of Accounts for an organization

        Returns cached version or fetches from Xero if needed
        """

        try:
            xero_config = await self.supabase.get_xero_config(organization_id)

            if not xero_config:
                return []

            # Check if cache is fresh (less than 24 hours old)
            if xero_config.get('chart_of_accounts'):
                updated_at = xero_config.get('chart_of_accounts_updated_at')
                if updated_at:
                    updated_datetime = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                    age_hours = (datetime.utcnow() - updated_datetime).total_seconds() / 3600

                    if age_hours < 24:
                        # Cache is fresh
                        coa_data = xero_config['chart_of_accounts']
                        return [ChartOfAccountsItem(**item) for item in coa_data]

            # Cache is stale or doesn't exist, fetch fresh
            access_token = await self.get_valid_access_token(organization_id)
            if access_token:
                await self._fetch_and_cache_chart_of_accounts(
                    organization_id,
                    access_token,
                    xero_config['xero_tenant_id']
                )

                # Fetch updated config
                xero_config = await self.supabase.get_xero_config(organization_id)
                if xero_config and xero_config.get('chart_of_accounts'):
                    coa_data = xero_config['chart_of_accounts']
                    return [ChartOfAccountsItem(**item) for item in coa_data]

            return []

        except Exception as e:
            logger.error(f"Error getting chart of accounts: {e}")
            return []


# Singleton
_xero_auth_service = None


def get_xero_auth_service() -> XeroAuthService:
    """Get or create Xero auth service singleton"""
    global _xero_auth_service
    if _xero_auth_service is None:
        _xero_auth_service = XeroAuthService()
    return _xero_auth_service
