"""Enlaza el feature de Busqueda con sus steps."""
from pytest_bdd import scenarios

from tests.steps_comunes import *  # noqa: F401,F403

scenarios("busqueda.feature")