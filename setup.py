# -*- coding: utf-8 -*-
from setuptools import setup, find_packages

with open('requirements.txt') as f:
	install_requires = f.read().strip().split('\n')

# get version from __version__ variable in frappe_helper/__init__.py
from frappe_helper import __version__ as version

setup(
	name='frappe_helper',
	version=version,
	description='Frappe Helper',
	author='Quantum Bit Core',
	author_email='quantumbitcore.io@gmail.com',
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
