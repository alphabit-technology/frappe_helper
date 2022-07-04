class DeskForm{
	constructor(options) {
		Object.assign(this, options);
		this.container = "form-" + Math.random().toString(36).substr(2, 9);
		this.modal = null;
		this.form = null;
		this.options = options;
		this.construct();
		this.show();
	}

	construct(){
		this.modal = new frappe.ui.Dialog({
			title: this.title,
			fields: [
				{fieldname: this.container, fieldtype: 'HTML'},
				{fieldname: 'ht', fieldtype: 'HTML'},
			],
			on_hide: () => {
				close_grid_and_dialog();
			}
		});

		function close_grid_and_dialog() {
			// close open grid row
			var open_row = $(".grid-row-open");
			if (open_row.length) {
				var grid_row = open_row.data("grid_row");
				grid_row.toggle_view(false);
				return false;
			}

			// close open dialog
			if (cur_dialog && !cur_dialog.no_cancel_flag) {
				//cur_dialog.cancel();
				return false;
			}
		}

		if (!this.disabled_to_save){
			this.modal.set_primary_action(__("Save"), () => {
				if(this.form) {
					this.form.save(this.has_payment);
				}
			});
		}

		this.modal.fields_dict.ht.$wrapper.attr(
			`<div class='loading-form' style='font-size: xx-large; text-align: center; color: #8D99A6'>${__("Loading")}...</div>`
		);

		if(this.close_only_button){
			this.modal.$wrapper.attr({"data-keyboard":"false", "data-backdrop": "static", "id": `${self.container}`})
		}

		this.modal.$wrapper.prepend(`
			<style>
				#${this.container} .form-grid .grid-body .data-row .col.col-xs-1 .btn-open-row{
					display: none;
				}
			</style>
		`);

		this.modal.$wrapper.attr({
			"desk-form": "desk-form"
		});

		setTimeout(() => {
			this.load();
		}, 200);
	}

	load(background=false){
		if(typeof this.before_load != "undefined"){
			this.before_load()
		}
		this.form = new FrappeForm(this, background);
	}

	reload(){
		$("div[data-fieldname=" + this.container + "]").empty();
		this.load();
		return this;
	}

	background_reload(){
		this.load(true);
	}

	show(){
		this.modal.show();
		return this;
	}

	hide(){
		this.modal.hide();
		return this;
	}
}

class FrappeForm{
	constructor(DeskForm, background=false) {
		Object.assign(this, DeskForm.options, {
			wrapper: $("div[data-fieldname=" + DeskForm.container + "]"),
		});
		this.__desk_form = DeskForm;
		this.container = DeskForm.container;
		this.ready = false;
		this.get_data(background);
	}

	get_data(background=false) {
		frappe.call({
			method: 'frappe_helper.frappe_helper.doctype.desk_form.desk_form.get_form_data',
			args: {
				doctype: this.doctype,
				docname: this.docname,
				form_name: this.form_name
			},
			freeze: background===false,
		}).then(r => {
			$("div[data-fieldname=" + this.container + "]").empty();
			const { doc, desk_form, links } = r.message;
			this.doc = doc;

			desk_form.desk_form_fields.map(df => {
				if (df.fieldtype === 'Table') {
					df.get_data = () => {
						let data = [];
						if(doc) {
							data = doc[df.fieldname];
						}
						return data;
					};

					df.options = null;

					if (r.message.hasOwnProperty(df.fieldname)) {
						df.fields = r.message[df.fieldname];
					}
				}
			});

			this.render(doc, desk_form, links);
		});
	}

	render(doc, desk_form) {
		const query_params = frappe.utils.get_query_params();

		desk_form.desk_form_fields.map(df => {
			if (df.fieldtype==='Attach') {
				df.is_private = true;
			}

			if (df.fieldtype==='Table') {
				df.in_place_edit = true;
				df.fields.filter(f => f.fieldname === 'name').map(f => {
					f.hidden = 1;
				});
			}

			// Set defaults
			if (query_params && query_params["new"] == 1 && df.fieldname in query_params) {
				df.default = query_params[df.fieldname];
			}

			delete df.parent;
			delete df.parentfield;
			delete df.parenttype;
			delete df.doctype;

			return df;
		});

		this.field_group = new frappe.ui.FieldGroup({
			parent: this.wrapper,
			fields: desk_form.desk_form_fields
		});

		this.field_group.make();

		this.wrapper.find(".form-column").unwrap(".section-body");

		this.wrapper.attr({"desk-form": 'desk-form'});

		if(doc) {
			this.field_group.set_values(doc);
		}

		setTimeout(() => {
			this.field_group.fields_list.forEach((field_instance) => {
				const instance_value = field_instance.value;
				if (instance_value != null && field_instance.df.fieldtype === "Attach" && instance_value.match(".(?:jpg|gif|jpeg|png)") ){
					field_instance.$input_wrapper.append(`<img src=${field_instance.get_value()} width="auto" height=200>`);
				}

				if (field_instance.df.fieldtype === "Table") {
					['delete-row', 'duplicate-row', 'mov-row', 'append-row', 'insert-row', 'remove-all-rows'].forEach(class_name => {
						field_instance.grid.wrapper.find(`.grid-${class_name}`).hide();
					});
				};
			});

			this.ready = true;
			$(".loading-form").remove();

			this.set_initial_values(doc);
		}, 0);

		if(typeof this.after_load != "undefined"){
			this.after_load();
		}
	}

	set_initial_values(doc){
		Object.entries(this.initial_values || {}).forEach(([field, value]) => {
			this.set_value(field, value);
		});

		Object.entries(this.field_properties || {}).forEach(([field, props]) => {
			const child_field = field.split(".");
			
			if (child_field.length > 1) {
				field = this.get_field(child_field[0]).grid.get_field(child_field[1]);

			}else{
				field = this.get_field(child_field[0]);
			}

			Object.entries(props).forEach(([prop, value]) => {
				if(prop === "get_query") {
					field.get_query = value;
				}else{
					this.set_field_property(field, prop, value);
				}
			});
		});
	}

	get_form(){
		return $("div[data-web-form='"+this.form_name+"']");
	}

	get_values() {
		let values = this.field_group.get_values(this.allow_incomplete);
		if (!values) return null;
		values.doctype = this.doctype;
		values.name = this.docname;
		values.form_name = this.form_name;
		return values;
	}

	get_field(fieldname) {
		const field = this.field_group.fields_dict[fieldname];
		if (!field) {
			throw `No field ${fieldname}`;
		}
		return field;
	}

	get_input(fieldname) {
		const $input = this.get_field(fieldname).$input;
		if (!$input) {
			throw `Cannot set trigger for ${fieldname}`;
		}
		return $input;
	}

	get_value(fieldname) {
		return this.field_group.get_value(fieldname);
	}

	set_value(fieldname, value) {
		return this.field_group.set_value(fieldname, value);
	}

	set_field_property(field, property, value) {
		field.df = field.df || {};

		field.df[property] = value;
		
		if(field.refresh) field.refresh();
	}

	on(fieldname, fn) {
		const field = this.get_field(fieldname);
		const $input = this.get_input(fieldname);
		$input.on('change', (event) => {
			return fn(field, field.get_value(), event);
		});
	}

	validate() {
		return true;
	}

	reload() {
		this.__desk_form.reload();
	}

	hide() {
		this.__desk_form.hide();
	}

	save(for_payment, on_save=null) {
		if(!this.ready) return;

		if (this.validate()===false) {
			return false;
		}

		let data = this.get_values();
		if (!data) {
			return false;
		}

		if (window.saving) {
			return false;
		}

		window.saving = true;
		frappe.form_dirty = false;
		var $form = this.get_form();

		frappe.call({
			type: "POST",
			method: 'frappe_helper.frappe_helper.doctype.desk_form.desk_form.accept',
			args: {
				data: data,
				desk_form: this.form_name,
				docname: this.docname,
				for_payment: for_payment
			},
			freeze: true,
			btn: $form.find("[type='submit']"),
			callback: (data) => {
				if(!data.exc) {
					this.doc_name = data.message.name;

					if(frappe.is_new && frappe.login_required) {
						// reload page (with ID)
						window.location.href = window.location.pathname + "?name=" + frappe.doc_name;
					}

					if(for_payment && data.message) {
						// redirect to payment
						window.location.href = data.message;
					}

					// refresh values
					if (this.desk_form) {
						this.desk_form.field_group.set_values(data.message);
					}

					if(typeof this.call_back != "undefined"){
						this.call_back(this);
					}

					if(on_save != null){
						on_save();
					}

				} else {
					frappe.msgprint(__('There were errors. Please report this.'));
				}
			},
			always: function(r) {
				window.saving = false;
			}
		});
		return true;
	}
}