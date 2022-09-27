from __future__ import unicode_literals
import frappe
from itertools import chain
import os
import json
from erpnext.setup.utils import insert_record
from itertools import chain

def after_install():
    create_desk_forms()


def insert_desk_form(form_data):
    desk_form = frappe.new_doc("Desk Form")
    desk_form.update(form_data)
    desk_form.set("docstatus", 0)

    print("    Inserting Desk Form: {}".format(form_data.get("name")))

    desk_form.insert()

def create_desk_forms():
    basedir = os.path.abspath(os.path.dirname(__file__))
    apps_dir = basedir.split("apps")[0] + "apps"

    frappe.db.sql("""DELETE FROM `tabDesk Form`""")
    frappe.db.sql("""DELETE FROM `tabDesk Form Field`""")

    print("Building Desk Forms")

    for app_name in os.listdir(apps_dir):
        print("  Processing Desk Forms for {} App".format(app_name))

        for dirpath, dirnames, filenames in os.walk(os.path.join(apps_dir, app_name, app_name, app_name, "desk_form")):
            for filename in filenames:
                _, extension = os.path.splitext(filename)

                if extension in ['.json']:
                    abspath = os.path.join(dirpath, filename)
                    f = open(abspath)

                    insert_desk_form(json.load(f))
                    f.close()

    print("Building Desk Forms Complete")
