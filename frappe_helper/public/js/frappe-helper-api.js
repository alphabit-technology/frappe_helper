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
                if(typeof options.always != "undefined") options.always(r);
            },
            callback: function (r) {
                if(typeof options.callback != "undefined") options.callback(r);
            },
            freeze: (typeof options.freeze !== "undefined" ? false : options.freeze)
        });
    }
}
let frappeHelper = new FrappeHelperApi();