'use strict';

function execute(args) {
    var signifyd = require('int_signifyd/cartridge/scripts/service/signifyd');
    signifyd.sendReroute(args.orderId);
}

exports.execute = execute;
