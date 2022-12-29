class DeskForm extends FrappeForm {
	is_hide = true;
	has_footer = true;
	has_primary_action = true;
	base_url = "frappe_helper.frappe_helper.doctype.desk_form.desk_form.";

	constructor(options) {
		super(options);

		this.in_modal = !this.location;
		if (this.form_name) this.initialize();
	}

	remove(){
		this._wrapper && this._wrapper.$wrapper.remove();
	}

	get parent() {
		return this.body;
	}

	get body() {
		return this.in_modal ? $(this._wrapper.$wrapper).find('.modal-body') : this._wrapper;
	}

	get footer() {
		return this.in_modal ? $(this._wrapper.$wrapper).find('.modal-footer') : this.body;
	}

	get footer_buttons_wrapper() {
		return this.footer.find('.standard-actions');
	}

	get primary_btn() {
		return this.footer.find('.btn-primary');
	}

	get_primary_btn() {
		return this.primary_btn;
	}

	field(field_name) {
		return this.in_modal ? this._wrapper.fields_dict[field_name].$wrapper : null;
	}

	async initialize() {
		this._wrapper = this.location || new frappe.ui.Dialog({
				title: this.title,
				on_hide: () => {
					close_grid_and_dialog();
				}
			});

		await super.initialize();

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

		this.in_modal && this._wrapper && this._wrapper.wrapper.classList.add('modal-lg');

		this.body.show();
		this.show();
	}

	execute_primary_action() {
		this.primary_btn.focus();
		
		if (this.primary_action) {
			if (this.last_data != JSON.stringify(this.doc)) {
				this.last_data = JSON.stringify(this.doc);
				this.primary_action();
			}
		} else {
			this.save();
		}
	}

	async make() {
		await super.make();

		this.customize();

		if (this.has_primary_action && this.in_modal) {
			const button = this.primary_btn;
			if(button){
				button.on('click', () => {
					this.execute_primary_action();
				});

				button.text(this.primary_action_label || __('Save'));
				button.removeClass('hide');
			}

			this.footer.removeClass('hide');
			this.footer.css('display', 'flex');
		}else{
			this.footer.hide();
		}

		/*if (this.close_only_button) {
			const button = this.get_field("close_only_button");

			button ? button.attr({ "data-keyboard": "false", "data-backdrop": "static", "id": `${this.identifier}` }) : "";
		}*/
	}

	customize() {
		this.body.addClass('desk-form');
		return;
		Object.entries(this.field_properties || {}).forEach(([f, props]) => {
			const child_field = f.split(".");
			let field, grid;

			if (child_field.length > 1) {
				grid = this.get_field(child_field[0]).grid;
				field = grid.get_field(child_field[1]);
			} else {
				field = this.get_field(child_field[0]);
			}
			
			Object.entries(props).forEach(([prop, value]) => {
				if(field){
					field.df ??= {};

					if (prop === "get_query") {
						field.get_query = value;
						return;
					} else if (prop === "value") {
						field.set_value(value);
						return;
					}

					if(prop === "on_change"){
						field.df.onchange = () => {
							value();
						}
					}else{
						field.df[prop] = value;
						/*if(grid){
							field.df[prop] = value;
						}else{
							self.set_field_property(field.df.fieldname, prop, value);
						}*/
					}
				}
			});


		});
	}

	load() {
		this.before_load && this.before_load();
		super.initialize();
		this.initialize_fetches();
	}

	async reload(doc=null, from_server=false) {
		this.reloading = true;
		this.before_load && this.before_load();
		this.doc = doc || await this.get_doc(from_server);

		this.refresh();
		this.customize();
		this.reloading = false;
		

		if(this.on_reload && typeof this.on_reload === "function"){
			setTimeout(() => {
				this.on_reload();
			}, 100);
		}
		return this;
	}

	background_reload() {
		this.get_doc(true).then(doc => {
			this.doc = doc;
			this.refresh();
		});
	}

	show() {
		this.is_hide = false;
		this._wrapper.show();
		return this;
	}

	hide() {
		this.is_hide = true;
		this._wrapper.hide();
		return this;
	}

	hide_field(fieldname) {
		if(Array.isArray(fieldname)){
			fieldname.forEach(field => {
				this.hide_field(field);
			});
		}else{
			this.set_field_display(fieldname, true);
		}
	}

	show_field(fieldname) {
		if(Array.isArray(fieldname)){
			fieldname.forEach(field => {
				this.show_field(field);
			});
		}else{
			this.set_field_display(fieldname, false);
		}
	}

	set_field_display(fieldname, hide) {
		const field = this.get_field(fieldname);
		console.log(["set_field_display", fieldname, hide, field])
		if (field) {
			//field.df.hidden = hide;
			//field.refresh();
			field.$wrapper[hide ? 'hide' : 'show']();
		}
	}

	toggle() {
		this.is_hide ? this.show() : this.hide();
		return this;
	}
}