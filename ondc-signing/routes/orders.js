const orders = {};

function addOrder(orderId, orderData) {
    orders[orderId] = orderData;
}

function getOrder(orderId) {
    return orders[orderId];
}

function orderExists(orderId) {
    return orders.hasOwnProperty(orderId);
}

module.exports = {
    addOrder,
    getOrder,
    orderExists
};
