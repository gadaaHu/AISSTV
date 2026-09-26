"""WS-Discovery for ONVIF cameras on the local network."""
import logging
from typing import Optional

log = logging.getLogger(__name__)


async def discover_onvif(timeout: int = 5) -> list[dict]:
    try:
        from wsdiscovery.discovery import ThreadedWSDiscovery as WSDiscovery
        from wsdiscovery import QName
    except ImportError:
        log.warning("wsdiscovery not installed")
        return []

    wsd = WSDiscovery()
    wsd.start()
    try:
        services = wsd.searchServices(timeout=timeout)
    finally:
        wsd.stop()

    results = []
    for svc in services:
        for addr in svc.getXAddrs():
            results.append({
                "xaddr": addr,
                "scopes": [s.getValue() for s in svc.getScopes()],
            })
    return results