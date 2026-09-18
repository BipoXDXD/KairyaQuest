"""O pacote precisa ser importável sem manipular sys.path (README s4)."""

import focusquest


def test_package_is_importable() -> None:
    assert focusquest.__doc__ is not None
