/**
 * attachLayoutHelper(app)
 * Adds a minimal layout() helper for EJS templates enabling pattern:
 *   <% layout('partials/layout') %>
 *   (content...) becomes available as <%= body %> inside the layout template.
 * Only applied when EJS is the view engine and res.render present.
 */
export function attachLayoutHelper(app) {
  app.use((req, res, next) => {
    if (!res.render || res.__layoutHelperAttached) return next();
    res.__layoutHelperAttached = true;
    res.locals.__layout = null;
    res.locals.layout = function(layoutPath){ res.locals.__layout = layoutPath; };
    const origRender = res.render.bind(res);
    res.render = function(view, options = {}, callback){
      return origRender(view, { ...res.locals, ...options }, function(err, html){
        if (err) return callback ? callback(err) : req.next?.(err);
        if (!res.locals.__layout) return callback ? callback(null, html) : res.send(html);
        const bodyHtml = html;
        const layoutView = res.locals.__layout;
        res.locals.__layout = null; // reset to avoid recursion
        const layoutLocals = { ...res.locals, ...options, body: bodyHtml };
        return origRender(layoutView, layoutLocals, callback ? callback : function(lErr, lHtml){
          if (lErr) return req.next?.(lErr);
          res.send(lHtml);
        });
      });
    };
    next();
  });
}

export default attachLayoutHelper;
