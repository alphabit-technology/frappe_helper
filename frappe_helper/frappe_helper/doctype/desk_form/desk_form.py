# -*- coding: utf-8 -*-
# Copyright (c) 2021, Quantum Bit Core and contributors
# For license information, please see license.txt

# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals

import json
import os

from six import iteritems
from six.moves.urllib.parse import urlencode

import frappe
from frappe import _, scrub
from frappe.core.doctype.file.file import get_max_file_size, remove_file_by_url
from frappe.custom.doctype.customize_form.customize_form import docfield_properties
from frappe.desk.form.meta import get_code_files_via_hooks
from frappe.modules.utils import export_module_json, get_doc_module
from frappe.utils import cstr
from frappe.website.utils import get_comment_list
from frappe.model.document import Document


class DeskForm(Document):
	def updateJsonFile(self):
		app = frappe.db.get_value('Module Def', self.module, 'app_name')
		path = os.path.abspath(os.path.dirname(__file__))
		path = os.path.join(path.split(
			"apps")[0], "apps", app, app, app, 'desk_form')

		file_name = self.name.replace('-', '_')

		file_path = os.path.join(path, file_name, file_name + '.json')

		jsonFile = open(file_path, "r") # Open the JSON file for reading
		data = json.load(jsonFile) # Read the JSON into the buffer
		jsonFile.close() # Close the JSON file

		## Working with buffered content
		tmp = data
		tmp["docstatus"] = 1

		## Save our changes to JSON file
		jsonFile = open(file_path, "w+")
		jsonFile.write(json.dumps(tmp))
		jsonFile.close()

	def after_delete(self):
		self.updateJsonFile()

	def onload(self):
		#super(DeskForm, self).onload()
		if self.is_standard:
			self.use_meta_fields()

	def validate(self):
		#super(DeskForm, self).validate()


		if not self.module:
			self.module = frappe.db.get_value('DocType', self.doc_type, 'module')

		if not frappe.flags.in_import:
			self.validate_fields()

	def validate_fields(self):
		'''Validate all fields are present'''
		from frappe.model import no_value_fields
		missing = []
		meta = frappe.get_meta(self.doc_type)


		for df in self.desk_form_fields:
			if not df.fieldname and df.label:
				df.fieldname = scrub(df.label)

			if df.fieldname and (df.fieldtype not in no_value_fields and not meta.has_field(df.fieldname) and not df.extra_field):
				missing.append(df.fieldname)

		if missing:
			frappe.throw(_('Following fields are missing:') + ' in DeskForm ' + self.title + '<br>' + '<br>'.join(missing))

	def reset_field_parent(self):
		'''Convert link fields to select with names as options'''
		for df in self.desk_form_fields:
			df.parent = self.doc_type

	def use_meta_fields(self):
		'''Override default properties for standard web forms'''
		meta = frappe.get_meta(self.doc_type)

		for df in self.desk_form_fields:
			meta_df = meta.get_field(df.fieldname)

			if not meta_df:
				continue

			for prop in docfield_properties:
				if df.fieldtype==meta_df.fieldtype and prop not in ("idx",
					"reqd", "default", "description", "default", "options",
					"hidden", "read_only", "label"):
					df.set(prop, meta_df.get(prop))


			# TODO translate options of Select fields like Country

	# export
	def on_update(self):
		"""
			Writes the .txt for this page and if write_content is checked,
			it will write out a .html file
		"""
		path = export_module_json(self, self.is_standard, self.module)

		if path:
			# js
			if not os.path.exists(path + '.js'):
				with open(path + '.js', 'w') as f:
					f.write("""frappe.ready(function() {
	// bind events here
})""")

			# py
			if not os.path.exists(path + '.py'):
				with open(path + '.py', 'w') as f:
					f.write("""from __future__ import unicode_literals

import frappe

def get_context(context):
	# do your desk here
	pass
""")

	def get_context(self, context):
		'''Build context to render the `desk_form.html` template'''
		self.set_desk_form_module()

		context._login_required = False
		if self.login_required and frappe.session.user == "Guest":
			context._login_required = True

		doc, delimeter = make_route_string(frappe.form_dict)
		context.doc = doc
		context.delimeter = delimeter

		# check permissions
		if frappe.session.user == "Guest" and frappe.form_dict.name:
			frappe.throw(_("You need to be logged in to access this {0}.").format(self.doc_type), frappe.PermissionError)

		if frappe.form_dict.name and not has_desk_form_permission(self.doc_type, frappe.form_dict.name):
			frappe.throw(_("You don't have the permissions to access this document"), frappe.PermissionError)

		self.reset_field_parent()

		if self.is_standard:
			self.use_meta_fields()

		if not context._login_required:
			if self.allow_edit:
				if self.allow_multiple:
					if not frappe.form_dict.name and not frappe.form_dict.new:
						# list data is queried via JS
						context.is_list = True
				else:
					if frappe.session.user != 'Guest' and not frappe.form_dict.name:
						frappe.form_dict.name = frappe.db.get_value(self.doc_type, {"owner": frappe.session.user}, "name")

					if not frappe.form_dict.name:
						# only a single doc allowed and no existing doc, hence new
						frappe.form_dict.new = 1

		# always render new form if login is not required or doesn't allow editing existing ones
		if not self.login_required or not self.allow_edit:
			frappe.form_dict.new = 1

		self.load_document(context)
		context.parents = self.get_parents(context)

		if self.breadcrumbs:
			context.parents = frappe.safe_eval(self.breadcrumbs, { "_": _ })

		context.has_header = ((frappe.form_dict.name or frappe.form_dict.new)
			and (frappe.session.user!="Guest" or not self.login_required))

		if context.success_message:
			context.success_message = frappe.db.escape(context.success_message.replace("\n",
				"<br>")).strip("'")

		self.add_custom_context_and_script(context)
		if not context.max_attachment_size:
			context.max_attachment_size = get_max_file_size() / 1024 / 1024

		context.show_in_grid = self.show_in_grid
		self.load_translations(context)

	def load_translations(self, context):
		translated_messages = frappe.translate.get_dict('doctype', self.doc_type)
		# Sr is not added by default, had to be added manually
		translated_messages['Sr'] = _('Sr')
		context.translated_messages = frappe.as_json(translated_messages)

	def load_document(self, context):
		'''Load document `doc` and `layout` properties for template'''
		if frappe.form_dict.name or frappe.form_dict.new:
			context.parents = [{"route": self.route, "label": _(self.title) }]

		if frappe.form_dict.name:
			context.doc = frappe.get_doc(self.doc_type, frappe.form_dict.name)
			context.title = context.doc.get(context.doc.meta.get_title_field())
			context.doc.add_seen()

			context.reference_doctype = context.doc.doctype
			context.reference_name = context.doc.name

			if self.show_attachments:
			    context.attachments = frappe.get_all('File', filters= {"attached_to_name": context.reference_name, "attached_to_doctype": context.reference_doctype, "is_private": 0},
					fields=['file_name','file_url', 'file_size'])

			if self.allow_comments:
				context.comment_list = get_comment_list(context.doc.doctype,
					context.doc.name)

	def add_custom_context_and_script(self, context):
		'''Update context from module if standard and append script'''
		if self.desk_form_module:
			new_context = self.desk_form_module.get_context(context)

			if new_context:
				context.update(new_context)

			js_path = os.path.join(os.path.dirname(self.desk_form_module.__file__), scrub(self.name) + '.js')
			if os.path.exists(js_path):
				script = frappe.render_template(open(js_path, 'r').read(), context)

				for path in get_code_files_via_hooks("webform_include_js", context.doc_type):
					custom_js = frappe.render_template(open(path, 'r').read(), context)
					script = "\n\n".join([script, custom_js])

				context.script = script

			css_path = os.path.join(os.path.dirname(self.desk_form_module.__file__), scrub(self.name) + '.css')
			if os.path.exists(css_path):
				style = open(css_path, 'r').read()

				for path in get_code_files_via_hooks("webform_include_css", context.doc_type):
					custom_css = open(path, 'r').read()
					style = "\n\n".join([style, custom_css])

				context.style = style

	def get_parents(self, context):
		parents = None

		if context.is_list and not context.parents:
			parents = [{"title": _("My Account"), "name": "me"}]
		elif context.parents:
			parents = context.parents

		return parents

	def set_desk_form_module(self):
		'''Get custom web form module if exists'''
		self.desk_form_module = self.get_desk_form_module()

	def get_desk_form_module(self):
		if self.is_standard:
			return get_doc_module(self.module, self.doctype, self.name)

	def validate_mandatory(self, doc):
		'''Validate mandatory web form fields'''
		missing = []
		for f in self.desk_form_fields:
			if f.reqd and doc.get(f.fieldname) in (None, [], ''):
				missing.append(f)

		if missing:
			frappe.throw(_('Mandatory Information missing:') + '<br><br>'
				+ '<br>'.join(['{0} ({1})'.format(d.label, d.fieldtype) for d in missing]))


@frappe.whitelist()
def accept(desk_form, data, doc_name=None):
	'''Save the desk form'''
	data = frappe._dict(json.loads(data))
	doctype = data.doctype if not data.doctype else frappe.db.get_value('Desk Form', desk_form, 'doc_type')

	files = []
	files_to_delete = []

	desk_form = frappe.get_doc("Desk Form", desk_form)

	if data.name and not desk_form.allow_edit:
		frappe.throw(_("You are not allowed to update this Desk Form Document"))

	frappe.flags.in_desk_form = True
	meta = frappe.get_meta(doctype)

	doc = get_doc(doctype, doc_name)

	# set values
	for field in desk_form.desk_form_fields:
		fieldname = field.fieldname# or field.label.replace(' ', '_').lower()
		#frappe.throw(fieldname)
		df = meta.get_field(fieldname)
		value = data.get(fieldname, None)

		if df and df.fieldtype in ('Attach', 'Attach Image'):
			if value and 'data:' and 'base64' in value:
				files.append((fieldname, value))
				if not doc.name:
					doc.set(fieldname, '')
				continue

			elif not value and doc.get(fieldname):
				files_to_delete.append(doc.get(fieldname))

		doc.set(fieldname, value)

	if doc.new:
		# insert
		if desk_form.login_required and frappe.session.user == "Guest":
			frappe.throw(_("You must login to submit this form"))

		ignore_mandatory = True if files else False

		doc.insert(ignore_permissions=True, ignore_mandatory=ignore_mandatory)
	else:
		if has_desk_form_permission(doctype, doc.name, "write"):
			doc.save(ignore_permissions=True)
		else:
			# only if permissions are present
			doc.save()

	# add files
	if files:
		for f in files:
			fieldname, filedata = f

			# remove earlier attached file (if exists)
			if doc.get(fieldname):
				remove_file_by_url(doc.get(fieldname), doctype=doctype, name=doc.name)

			# save new file
			filename, dataurl = filedata.split(',', 1)
			_file = frappe.get_doc({
				"doctype": "File",
				"file_name": filename,
				"attached_to_doctype": doctype,
				"attached_to_name": doc.name,
				"content": dataurl,
				"decode": True})
			_file.save()

			# update values
			doc.set(fieldname, _file.file_url)

		doc.save(ignore_permissions = True)

	if files_to_delete:
		for f in files_to_delete:
			if f:
				remove_file_by_url(doc.get(fieldname), doctype=doctype, name=doc.name)


	frappe.flags.desk_form_doc = doc

	return doc

@frappe.whitelist()
def delete(desk_form_name, docname):
	desk_form = frappe.get_doc("Desk Form", desk_form_name)

	owner = frappe.db.get_value(desk_form.doc_type, docname, "owner")
	if frappe.session.user == owner and desk_form.allow_delete:
		frappe.delete_doc(desk_form.doc_type, docname, ignore_permissions=True)
	else:
		raise frappe.PermissionError("Not Allowed")


@frappe.whitelist()
def delete_multiple(desk_form_name, docnames):
	desk_form = frappe.get_doc("Desk Form", desk_form_name)

	docnames = json.loads(docnames)

	allowed_docnames = []
	restricted_docnames = []

	for docname in docnames:
		owner = frappe.db.get_value(desk_form.doc_type, docname, "owner")
		if frappe.session.user == owner and desk_form.allow_delete:
			allowed_docnames.append(docname)
		else:
			restricted_docnames.append(docname)

	for docname in allowed_docnames:
		frappe.delete_doc(desk_form.doc_type, docname, ignore_permissions=True)

	if restricted_docnames:
		raise frappe.PermissionError("You do not have permisssion to delete " + ", ".join(restricted_docnames))


def has_desk_form_permission(doctype, name, ptype='read'):
	if frappe.session.user=="Guest":
		return False

	# owner matches
	elif frappe.db.get_value(doctype, name, "owner")==frappe.session.user:
		return True

	elif frappe.has_website_permission(name, ptype=ptype, doctype=doctype):
		return True

	elif check_webform_perm(doctype, name):
		return True

	else:
		return False


def check_webform_perm(doctype, name):
	doc = frappe.get_doc(doctype, name)
	if hasattr(doc, "has_webform_permission"):
		if doc.has_webform_permission():
			return True

@frappe.whitelist(allow_guest=False)
def get_desk_form_filters(desk_form_name):
	desk_form = frappe.get_doc("Desk Form", desk_form_name)
	return [field for field in desk_form.desk_form_fields if field.show_in_filter]


@frappe.whitelist(allow_guest=False)
def get_fetch_values(doctype, txt, searchfield, start, page_len, filters):
	if not frappe.has_permission(doctype):
		frappe.msgprint(_("No Permission"), raise_exception=True)

	if not filters:
		filters = {}

	filters.update({searchfield: ["like", "%" + txt + "%"]})

	return frappe.get_all(doctype, fields=["name", searchfield], filters=filters,
		order_by=searchfield, limit_start=start, limit_page_length=page_len)

def make_route_string(parameters):
	route_string = ""
	delimeter = '?'
	if isinstance(parameters, dict):
		for key in parameters:
			if key != "desk_form_name":
				route_string += route_string + delimeter + key + "=" + cstr(parameters[key])
				delimeter = '&'
	return (route_string, delimeter)


@frappe.whitelist(allow_guest=False)
def get_doc(doctype, doc_name=None):
	name = frappe.db.get_value(doctype, {"name": doc_name}) if doc_name else None
	
	if name:
		doc = frappe.get_doc(doctype, name)
		doc.new = False
	else:
		doc = frappe.new_doc(doctype)
		if doc_name:
			doc.set("name", doc_name)
		doc.new = True

	method = getattr(doc, 'onload', None)
	if callable(method):
		doc.onload()

	return doc

@frappe.whitelist(allow_guest=False)
def get_form(form_name=None):
	desk_form = frappe.get_doc('Desk Form', form_name)

	if desk_form.login_required and frappe.session.user == 'Guest':
		frappe.throw(_("Not Permitted"), frappe.PermissionError)

	out = frappe._dict()
	out.desk_form = desk_form

	# For Table fields, server-side processing for meta
	for field in out.desk_form.desk_form_fields:
		if field.fieldtype == "Table":
			field.fields = get_in_list_view_fields(field.options)
			out.update({field.fieldname: field.fields})

	return out

@frappe.whitelist(allow_guest=False)
def get_form_data(form_name=None, doc_name=None):
	desk_form = frappe.get_doc('Desk Form', form_name)

	if desk_form.login_required and frappe.session.user == 'Guest':
		frappe.throw(_("Not Permitted"), frappe.PermissionError)

	out = frappe._dict()
	out.desk_form = desk_form

	if frappe.session.user != 'Guest' and not doc_name and not desk_form.allow_multiple:
		doc_name = frappe.db.get_value(
			desk_form.doc_type, {"owner": frappe.session.user}, "name")

	doc = get_doc(desk_form.doc_type, doc_name)
	out.doc = doc
	#if doc_name:
	#	doc = frappe.get_doc(desk_form.doc_type, doc_name)
	#	out.doc = doc

	# For Table fields, server-side processing for meta
	for field in out.desk_form.desk_form_fields:
		if field.fieldtype == "Table":
			field.fields = get_in_list_view_fields(field.options)
			out.update({field.fieldname: field.fields})

	return out

@frappe.whitelist()
def get_in_list_view_fields(doctype):
	meta = frappe.get_meta(doctype)
	fields = []

	if meta.title_field:
		fields.append(meta.title_field)
	else:
		fields.append('name')

	if meta.has_field('status'):
		fields.append('status')

	fields += [df.fieldname for df in meta.fields if df.in_list_view and df.fieldname not in fields]

	def get_field_df(fieldname):
		if fieldname == 'name':
			return { 'label': 'Name', 'fieldname': 'name', 'fieldtype': 'Data' }
		return meta.get_field(fieldname).as_dict()

	return [get_field_df(f) for f in fields]

@frappe.whitelist(allow_guest=True)
def get_link_options(desk_form_name, doctype, allow_read_on_all_link_options=False):
	desk_form_doc = frappe.get_doc("Desk Form", desk_form_name)
	doctype_validated = False
	limited_to_user   = False
	if desk_form_doc.login_required:
		# check if frappe session user is not guest or admin
		if frappe.session.user != 'Guest':
			doctype_validated = True

			if not allow_read_on_all_link_options:
				limited_to_user   = True

	else:
		for field in desk_form_doc.desk_form_fields:
			if field.options == doctype:
				doctype_validated = True
				break

	if doctype_validated:
		link_options = []
		if limited_to_user:
			link_options = "\n".join([doc.name for doc in frappe.get_all(doctype, filters = {"owner":frappe.session.user})])
		else:
			link_options = "\n".join([doc.name for doc in frappe.get_all(doctype)])

		return link_options

	else:
		raise frappe.PermissionError('Not Allowed, {0}'.format(doctype))
