'use strict';


/**
* Executes the reroute job by sending a reroute request for the specified order.
* @param {Object} args - The arguments object containing job parameters.
* @param {string} args.orderId - The ID of the order to be rerouted.
* @returns {void}
*/
function execute(args) {
    var signifyd = require('int_signifyd/cartridge/scripts/service/signifyd');
    signifyd.sendReroute(args.orderId);
}

exports.execute = execute;
