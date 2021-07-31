# -*- coding: utf-8 -*-
# Copyright (c) 2021, Quantum Bit Core and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
import json
import hashlib


@frappe.whitelist()
def call(model, name, method, args=None):
    doc = frappe.get_doc(model, name)
    if args is not None:
        _args = json.loads(args)
        #args = [_args[arg] for arg in _args]
        kwargs = {arg: _args[arg] for arg in _args}
        return getattr(doc, method)(**kwargs)
        #return doc.run_method(method, **kwargs)
    else:
        return getattr(doc, method)


def encrypt(data, method):
    if not isinstance(data, bytes):
        data = data.encode('utf-8')

    if method == 'md5':
        return hashlib.md5(data).hexdigest()
    if method == 'sha1':
        return hashlib.sha1(data).hexdigest()
    if method == 'sha224':
        return hashlib.sha3_224(data).hexdigest()
