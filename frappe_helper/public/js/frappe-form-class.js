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
		
		await this.make();
	}

	initialize_fetches() {
		this.desk_form.desk_form_fields.forEach(df => {
			if (df.fetch_from) {
				this.trigger(df.fetch_from.split(".")[0] , "change");
			} 
		});
	}

 	async make() {
		const setup_add_fetch = (df_fetch_from, df_fetch_to, parent=null) => {
			df_fetch_from.listeners ??= {};
			df_fetch_from.listeners.change = [];

			df_fetch_from.listeners.change.push((e) => {
				if (parent) {
					const table_input = this.get_field(parent.fieldname).grid;
					const data = table_input.data;

					data.forEach((row, index) => {
						const row_input = table_input.get_row(index);
						const link_fetch = row_input.columns[df_fetch_from.fieldname].field;

						const target_fetch_inputs = Object.entries(df_fetch_to).map(([key, _df_fetch_to]) => {
							return row_input.columns[_df_fetch_to.fieldname].field
						}).reduce((acc, cur) => {
							if(cur) acc[cur.df.fieldname] = cur;
							return acc;
						}, {});

						this.fetch_link(link_fetch, target_fetch_inputs);
					});
				} else {
					const link_fetch = this.get_field(df_fetch_from.fieldname);

					const target_fetch_inputs = Object.entries(df_fetch_to).map(([key, df_fetch_to]) => {
						return this.get_field(df_fetch_to.fieldname);
					}).reduce((acc, cur) => {
						if(cur) acc[cur.df.fieldname] = cur;
						return acc;
					}, {});

					this.fetch_link(link_fetch, target_fetch_inputs);
				}
			});

			df_fetch_from.onchange = (e) => {
				df_fetch_from.listeners.change.forEach((listener) => {
					listener(e);
				});
			}
		}

		return new Promise(resolve => {
			const fetches = {};

			const setup_fetch = (fields, df, parent=null) => {
				if (!df.fetch_from) return;

				const fetch_from = fields.find(field => field.fieldname === df.fetch_from.split(".")[0]) || {};

				if (([
					'Data', 'Read Only', 'Text', 'Small Text', 'Currency', 'Check',
					'Text Editor', 'Code', 'Link', 'Float', 'Int', 'Date', 'Select'
				].includes(fetch_from.fieldtype) || [true, 1, "true", "1"].includes(fetch_from.read_only))) {

					const fetch_from_field = fetch_from.fieldname;
					const fetch_to = df.fieldname;

					fetches[fetch_from_field] ??= {};
					fetches[fetch_from_field].fetch_from = fetch_from;
					fetches[fetch_from_field].fetch_to ??= [];
					fetches[fetch_from_field].fetch_to[fetch_to] = df
					fetches[fetch_from_field].parent = parent;
				}
			}

			this.desk_form.desk_form_fields.forEach(df => {
				setup_fetch(this.desk_form.desk_form_fields, df);

				const get_field_from_field_properties = (fieldname, parent=null) => {
					if(this.field_properties){
						const field_props = this.field_properties[(parent ? parent + "." : "") + fieldname];

						return field_props || {};
					}

					return {}
				}

				if (df.fieldtype === 'Table') {
					df.get_data = () => {
						return this.doc ? this.doc[df.fieldname] : [];
					}

					if (this.data.hasOwnProperty(df.fieldname)) {
						df.fields = this.data[df.fieldname];
					}

					(df.fields || []).forEach((f, index) => {
						
						if (f.fieldname === 'name'){
							//const x = myArray.splice(index, 1);
							//df.fields.splice(index, 1);
							// f.read_only = 1;
						}else{
							setup_fetch(df.fields, f, df);
							Object.assign(f, get_field_from_field_properties(f.fieldname, df.fieldname))
						}
					});

					df.options = null;

				}else{
					Object.assign(df, get_field_from_field_properties(df.fieldname));

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

			Object.values(fetches).forEach(fetch => {
				setup_add_fetch(fetch.fetch_from, fetch.fetch_to, fetch.parent);
			});

			super.make();

			setTimeout(() => {
				this.after_load && this.after_load(this);
				this.initialize_fetches();
			}, 200);
			
			resolve();
		});
	}


	fetch_link(link_fetch, fetches_to={}) {
		if (Object.keys(fetches_to).length === 0) return;
		
		const doctype = link_fetch.df.options;
		const from_cols = Object.values(fetches_to).map((fetch_to_df) => fetch_to_df.df.fetch_from.split('.')[1]);
		const doc_name = link_fetch.get_value();

		//if (link_fetch.last_value === doc_name) return;
		link_fetch.last_value = doc_name;

		frappe.call({
			method: 'frappe_helper.api.validate_link',
			type: "GET",
			args: {
				'value': doc_name,
				'options': doctype,
				'fetch': from_cols.join(",")
			},
			no_spinner: true,
			callback: (r) => {
				const fetch_values = r.fetch_values || [];
				Object.values(fetches_to).map((fetch_to_df, index) => fetch_to_df.set_value(r.message == 'Ok' ? fetch_values[index] : ''));
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
		if(Array.isArray(field_name)){
			field_name.forEach(field => {
				this.set_field_property(field, property, value);
			});
			return;
		}

		if(typeof property === 'object'){
			Object.keys(property).forEach(key => {
				this.set_field_property(field_name, key, property[key]);
			});
			return;
		}

		const field = this.get_field(field_name);
		field.doctype = field.df.doctype;
		field.docname = field.df.docname;
		
		this.set_df_property(field_name, property, value);
	}

	get_fields() {
		return this.fields_dict;
	}

	get_section(section_name) {
		return this.get_field(section_name);
	}

	on(fieldname, event, fn) {
		if(Array.isArray(fieldname)){
			fieldname.forEach(f => this.on(f, event, fn));
			return;
		}

		const field = this.get_field(fieldname);

		if(field && field.df){
			const df = field.df;
			df.listeners ??= {};
			df.listeners[event] ??= [];
			df.listeners[event].push(fn);

			df[`on${event}`] = () => {
				df.listeners[event].forEach(fn => {
					fn(field, fieldname);
				});
			}
		}
	}

	trigger(fieldname, event) {
		if(Array.isArray(fieldname)){
			fieldname.forEach(f => this.trigger(f, event));
			return;
		}
		const field = this.get_field(fieldname);
		const e = field && field.df[`on${event}`]

		e && typeof e === 'function' && e(this.get_value(fieldname));
	}

	execute_event(fieldname, event) {
		const field = this.get_field(fieldname);

		if (field && field.df) {
			const df = field.df;
			df.listeners ??= {};
			df.listeners[event] ??= [];
			df.listeners[event].push(fn);

			df[`on${event}`] = () => {
				df.listeners[event].forEach(fn => {
					fn(this.get_value(fieldname));
				});
			}
		}
	}

	save(options={}, force=false) {
		// validation hack: get_values will check for missing data
		return new Promise(resolve => {
			setTimeout(() => {
				const doc_values = super.get_values(force);
				
				if (!doc_values){
					options.error && options.error(false);
					return;
				}

				if (window.saving){
					options.error && options.error(__("Please wait for the other operation to complete"));
					return;
				}

				Object.assign(this.doc, doc_values || {});
				this.doc.doctype = this.doctype;

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

							this.callback && this.callback(this);
							this.on_save && this.on_save(data);
							options.success && options.success(data);
						} else {
							options.error && options.error(__('There were errors. Please report this.'));
						}

						options.always && options.always(data);
					},
					always: (r) => {
						options.always && options.always(r);
						window.saving = false;
					},
					error: function (r) {
						options.always && options.always(r);
						options.error && options.error(__('There were errors. Please report this.'));
					},
				});
			}, 200);
		});
	}

	refresh_dependency() {
		super.refresh_dependency();

		if(this.reloading) return;		

		this.on_refresh_dependency && this.on_refresh_dependency(this);
	}
}