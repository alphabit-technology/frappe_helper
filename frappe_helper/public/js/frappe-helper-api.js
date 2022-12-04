class FrappeHelperApi {
    #api = this;
    constructor() {}

    get api(){return this.#api}

    /**option{model, name, method}**/
    call(options={}){
        frappe.call({
            method: "frappe_helper.api.call",
            args: {model: options.model, name: options.name, method: options.method, args: options.args},
            always: function (r) {
                options.always && options.always(r);
            },
            callback: function (r) {
                options.callback && options.callback(r);
            },
            success: function (r) {
                options.success && options.success(r);
            },
            error: function (r) {
                options.error && options.error(r);
            },
            freeze: !!options.freeze
        });
    }
}

const frappeHelper = new FrappeHelperApi();