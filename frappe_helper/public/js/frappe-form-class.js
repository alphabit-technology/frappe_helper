frappe.provide("frappe.ui");

class FrappeForm extends frappe.ui.FieldGroup {
	background = false;
	buttons = {};
	button_label = "Save";
	fetch_dict = {};

	constructor(props) {
		super(props);
	}

	get_meta() {
		return this.#get("get_meta", {doctype: this.doctype});
	}

	async initialize() {
		this.form_name = this.desk_form ? this.desk_form.name : this.form_name;
		this.form_name = this.form_name.replaceAll(" ", "-").toLowerCase();
		
		if(!this.desk_form && !this.doc) {
			await this.get_all();
		}
		
		if(!this.desk_form) this.desk_form = await this.get_form();
		this.doctype = this.desk_form.doc_type;

		if (!this.doc && this.doc_name) this.doc = await this.get_doc();

		this.fields = this.desk_form.desk_form_fields;
		

		//new FrappeFormTest(this.doctype, this.desk_form, this.body, false, null, this.doc);
		await this.make();
	}

 	async make() {
		const setup_add_fetch = (df_fetch_from, df_fetch_to, parent=null) => {
			df_fetch_from.onchange = (e) => {
				if ((['Data', 'Read Only', 'Text', 'Small Text', 'Currency', 'Check',
					'Text Editor', 'Code', 'Link', 'Float', 'Int', 'Date', 'Select'].includes(df_fetch_to.fieldtype) || df_fetch_to.read_only == 1)) {

					if(parent) {
						const table_input = this.get_field(parent.fieldname).grid;
						const data = table_input.data;

						data.forEach((row, index) => {
							const row_input = table_input.get_row(index);
							const link_fetch = row_input.columns[df_fetch_from.fieldname].field;
							const target_fetch_input = row_input.columns[df_fetch_to.fieldname].field;

							this.fetch_link(link_fetch, target_fetch_input);
						});
					} else {
						const link_fetch = this.get_field(df_fetch_from.fieldname);
						const target_fetch_input = this.get_field(df_fetch_to.fieldname);

						this.fetch_link(link_fetch, target_fetch_input);
					}
				}
			}
		}

		return new Promise(resolve => {
			this.desk_form.desk_form_fields.forEach(df => {
				if (df.fetch_from) {
					setup_add_fetch(this.desk_form.desk_form_fields.find(field => field.fieldname === df.fetch_from.split(".")[0]) || {}, df);
				}

				if (df.fieldtype === 'Table') {
					df.get_data = () => {
						return this.doc ? this.doc[df.fieldname] : [];
					};

					if (this.data.hasOwnProperty(df.fieldname)) {
						df.fields = this.data[df.fieldname];
					}

					(df.fields || []).forEach(f => {
						if(f.fetch_from){
							setup_add_fetch(
								df.fields.find(field => field.fieldname === f.fetch_from.split(".")[0]) || {},
								f,
								df
							);
						}
						if (f.fieldname === 'name') f.hidden = 1;
					});

					df.options = null;

				}else{
					if(df.read_only){
						df.doctype = null;
						df.docname = null;
					}
				}

				delete df.parent;
				delete df.parentfield;
				delete df.parenttype;
				delete df.doctype;
			});

			super.make();

			setTimeout(() => {
				this.after_load && this.after_load(this);
			}, 500);
			
			resolve();
		});
	}

	fetch_link(link_fetch, target_input) {
		if (!target_input) return;

		const doctype = link_fetch.df.options;
		const from_col = target_input.df.fetch_from.split('.')[1];
		const doc_name = link_fetch.get_value();
		
		if(link_fetch.last_value === doc_name) return;
		link_fetch.last_value = doc_name;

		frappe.call({
			method: 'frappe.desk.form.utils.validate_link',
			type: "GET",
			args: {
				'value': doc_name,
				'options': doctype,
				'fetch': from_col
			},
			no_spinner: true,
			callback: (r) => {
				if (r.message == 'Ok') {
					if (r.fetch_values) {
						target_input.set_value(r.fetch_values[0]);
					}
				}
			}
		});
	}

	refresh() {
		super.refresh(this.doc);

		this.refresh_fields();
		this.on_refresh && this.on_refresh();
	}

	refresh_fields(){

		this.desk_form.desk_form_fields.forEach(df => {
			if (df.read_only) {
				df.doctype = null;
				df.docname = null;

				this.set_field_property(df.fieldname, "read_only", true);
			}
		});
	}

	async get_doc(from_server = false) {
		if (this.doc && !from_server) return this.doc;
		const data = await this.#get("get_doc", {doctype: this.doctype, doc_name: this.doc_name});

		return data;
	}

	async get_form() {
		const data = await this.#get("get_form", {form_name: this.form_name});

		return data.desk_form
	}

	async get_all() {
		this.data = await this.#get("get_form_data", {form_name: this.form_name, doc_name: this.doc_name});

		this.doc = this.data.doc;
		this.desk_form = this.data.desk_form;
	}

	async #get(method, args) {
		return new Promise(resolve => {
			frappe.call({
				method: `frappe_helper.frappe_helper.doctype.desk_form.desk_form.${method}`,
				args: args,
				freeze: this.background === false,
			}).then(r => {
				return resolve(r.message);
			});
		});
	}

	set_field_property(field_name, property, value) {
		const field = this.get_field(field_name);
		field.doctype = field.df.doctype;
		field.docname = field.df.docname;
		
		this.set_df_property(field_name, property, value);
	}

	get_fields() {
		return this.fields_dict;
	}

	on(fieldname, fn) {
		const field = this.get_field(fieldname);
		const $input = this.get_input(fieldname);
		
		$input.on('change', (event) => {
			return fn(field, field.get_value(), event);
		});
	}

	save(on_save = null) {
		if (this.validate && !this.validate()) {
			frappe.throw(__("Couldn't save, please check the data you have entered"), __("Validation Error"));
		}

		// validation hack: get_values will check for missing data
		let doc_values = super.get_values(this.allow_incomplete);

		if (!doc_values) return;

		if (window.saving) return;

		Object.assign(this.doc, doc_values);
		this.doc.doctype = this.doctype;

		// Save
		window.saving = true;
		frappe.form_dirty = false;

		frappe.call({
			type: "POST",
			method: this.base_url + 'accept',
			args: {
				desk_form: this.form_name,
				data: this.doc,
				doc_name: this.doc_name,
			},
			freeze: true,
			btn: this.buttons[this.button_label],
			callback: (data) => {
				if (!data.exc) {
					this.doc_name = data.message.name;

					if (typeof this.call_back != "undefined") {
						this.call_back(this);
					}

					if (on_save) on_save();
				} else {
					frappe.msgprint(__('There were errors. Please report this.'));
				}
			},
			always: function (r) {
				window.saving = false;
			}
		});
		
		return true;
	}

	refresh_dependency() {
		super.refresh_dependency();

		if(this.reloading) return;		

		this.on_refresh_dependency && this.on_refresh_dependency(this);
	}
}