"""
Azure Blob Storage helper for invoice fee attachments.

Behaviour is opt-in: if AZURE_STORAGE_CONNECTION_STRING is set, uploads go to
Blob Storage and files are served via short-lived SAS URLs. Otherwise the app
falls back to the local filesystem (used in local docker-compose / dev), so no
Azure account is required to run the project locally.

Env vars:
    AZURE_STORAGE_CONNECTION_STRING   Full connection string (with AccountKey).
    AZURE_STORAGE_CONTAINER           Blob container name (default: invoice-attachments).
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
_CONTAINER_NAME = os.getenv("AZURE_STORAGE_CONTAINER", "invoice-attachments")

# SAS read tokens are short-lived; regenerated on every read request.
_SAS_TTL_MINUTES = int(os.getenv("AZURE_STORAGE_SAS_TTL_MINUTES", "60"))


def blob_enabled() -> bool:
    """True when Blob Storage is configured and should be used for uploads."""
    return bool(_CONNECTION_STRING)


def _service_client():
    # Imported lazily so the package is only required when Blob is enabled.
    from azure.storage.blob import BlobServiceClient

    return BlobServiceClient.from_connection_string(_CONNECTION_STRING)


def _ensure_container(service) -> None:
    container = service.get_container_client(_CONTAINER_NAME)
    if not container.exists():
        container.create_container()


def upload_blob(blob_name: str, data: bytes, content_type: Optional[str] = None) -> None:
    """Upload bytes to the container, overwriting any blob with the same name."""
    from azure.storage.blob import ContentSettings

    service = _service_client()
    _ensure_container(service)
    blob = service.get_blob_client(container=_CONTAINER_NAME, blob=blob_name)
    content_settings = ContentSettings(content_type=content_type) if content_type else None
    blob.upload_blob(data, overwrite=True, content_settings=content_settings)


def delete_blob(blob_name: str) -> None:
    """Delete a blob; ignore if it no longer exists."""
    service = _service_client()
    blob = service.get_blob_client(container=_CONTAINER_NAME, blob=blob_name)
    try:
        blob.delete_blob()
    except Exception:
        # Missing blob is not an error for delete semantics.
        pass


def sas_url(blob_name: str) -> str:
    """Return a read-only SAS URL valid for _SAS_TTL_MINUTES."""
    from azure.storage.blob import generate_blob_sas, BlobSasPermissions

    service = _service_client()
    expiry = datetime.now(timezone.utc) + timedelta(minutes=_SAS_TTL_MINUTES)
    token = generate_blob_sas(
        account_name=service.account_name,
        container_name=_CONTAINER_NAME,
        blob_name=blob_name,
        account_key=service.credential.account_key,
        permission=BlobSasPermissions(read=True),
        expiry=expiry,
    )
    blob = service.get_blob_client(container=_CONTAINER_NAME, blob=blob_name)
    return f"{blob.url}?{token}"
