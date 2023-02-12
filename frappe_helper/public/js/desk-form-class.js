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
		this.$$wrapper.remove();
	}

	get $$wrapper() {
		return this.in_modal ? $(this._wrapper.$wrapper) : this._wrapper;
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

	get_value(fieldname) {
		if(Array.isArray(fieldname)){
			const values = [];
			fieldname.forEach(field => {
				values.push(this.get_value(field));
			});
			return values;
		}

		return super.get_value(fieldname);
	}

	async initialize() {
		if(this.location){
			this.location.append(`<div class="desk-form"></div>`);
			this._wrapper = this.location.find('.desk-form');
		}else{
			this._wrapper = new frappe.ui.Dialog({
				title: this.title,
				on_hide: () => {
					close_grid_and_dialog();
				}
			});
		}

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
			this.last_data ??= JSON.stringify(this.doc);
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
				button.on('click', (event) => {
					event.preventDefault();
					event.stopPropagation();
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

		this.make_custom_buttons_wrapper();
	}

	customize() {
		this.body.addClass('desk-form-body');
	}

	load() {
		this.before_load && this.before_load();
		super.initialize();
		this.initialize_fetches();
	}

	set_value(fieldname, value, on_reload=false) {
		const field = this.get_field(fieldname);
		if (field) {
			field.set_value && typeof field.set_value === "function" && field.set_value(value);
		}
	}

	async reload(doc=null, from_server=false) {
		this.reloading = true;
		this.before_load && this.before_load();
		this.doc = doc || await this.get_doc(from_server);

		this.doc = JSON.parse(JSON.stringify(this.doc));

		this.refresh();
		
		this.customize();
		this.reloading = false;
		
		setTimeout(() => {
			if(this.on_reload && typeof this.on_reload === "function"){
				this.on_reload();
			}
			this.reloading = false;
		}, 100);
		
		return this;
	}

	background_reload() {
		this.get_doc(true).then(doc => {
			this.doc = JSON.parse(JSON.stringify(doc));
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

	super_container_field(fieldname) {
		return $(this.get_field(fieldname).$wrapper.parent()[0]).parent()[0]
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

	make_custom_buttons_wrapper() {
		this.body.append(`
            <div class='widget-group custom-widget'>
                <div class=" widget-group-body grid-col-2"></div>
            </div>
        `)
	}

	add_action({ name, label, confirm = false, classes="", style="", type="default", icon="" } = {}, action) {
		this.actions ??= {};

		const wrapper = this.body.find(".custom-widget");

		wrapper.find(".widget-group-body").append(`
            <a
                class="widget widget-shadow shortcut-widget-box ${classes} bg-${type}"
                style="align-items:center;${style};"
                data-widget-name="${name}"
            >
                ${this.#action_content("", label, icon)}
            </a>
        `);

		this.actions[name] = frappe.jshtml({
			from_html: wrapper.find(`[data-widget-name="${name}"]`).get(0),
			content: this.#action_content("", "{{text}}", icon),
			text: `${__(label)}`
		}).on("click", () => {
			action && action();
		}, confirm ? DOUBLE_CLICK : null);
	}

	#action_content(value, template = "", icon = "") {
		return `
        <div class="widget-head">
            <div>
                <div class="widget-title ellipsis" style="font-size: 1.2em;">
					<span class="${icon}" style="padding-right: 5px;"></span> ${template} ${value}
				</div>
                <div class="widget-subtitle"></div>
                <div class="widget-control"></div>
            </div>
        </div>`
	}
}