module.exports = {
    my: require('node:module').createRequire(import.meta.url)('./my/server.mjs'),
    oidc: require('node:module').createRequire(import.meta.url)('./server/server.mjs'),
}


